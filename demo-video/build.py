#!/usr/bin/env python3
"""把分镜脚本渲染成 HTML 演示页，合成配音，用 Playwright 录屏，再用 ffmpeg 合成 mp4。

音画同步策略（重要）：
- **逐句配音**：每个字幕分句单独合成一段 TTS（`tts_<key>_<i>.mp3`），因此字幕 = 该句
  配音的起止，天然对齐，避免"整幕均分时长"造成的漂移。
- 幕时长 = max(动画最短时长, 本幕配音总时长 + 留白)，不把字幕拖到无声尾部。
- 录制后若发现视频被拉长（headless 渲染慢于录制器时钟），合成时用画面进度条反推比例 k，
  再 `setpts=k*PTS` 把视频压回实时，与自然语速的配音对齐。

用法：
    python3 build.py                # 全流程（配音 + 录屏 + 合成）
    python3 build.py --skip-record  # 只生成 demo.html / timeline.json / audio.m4a
    python3 build.py --no-tts       # 不配音（纯字幕，按 anim_min 排期）
    python3 build.py --only-mux     # 已有 raw.webm 与 audio.m4a，只做合成
"""
import argparse, asyncio, glob, json, os, re, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "template.html")
DEMO_HTML = os.path.join(HERE, "demo.html")
TIMELINE = os.path.join(HERE, "timeline.json")
AUDIO = os.path.join(HERE, "audio.m4a")
RAW = os.path.join(HERE, "raw.webm")
OUT = os.path.join(HERE, "窑炉中控台演示.mp4")

VOICE = "zh-CN-XiaoxiaoNeural"
RATE = "+8%"           # 语速略快，更紧凑

# ---------------------------------------------------------------- 分镜内容
# anim_min：动画至少需要的时间；tail：本幕配音结束后的留白。幕时长 = max(anim_min, 配音+tail)
SCENES = [
    dict(key="hook", anim_min=8.0, tail=1.4, narration=(
        "凌晨两点四十七分，二号冷却器出口温度悄悄冲破了历史最高值。"
        "没有人守在屏幕前——但四十秒后，一份带根因和处置建议的分析报告，已经推到了值班员手机上。")),
    dict(key="dashboard", anim_min=6.0, tail=1.4, narration=(
        "这是窑炉传感器中控台。它把全厂测点的实时数据、历史趋势、离线状态和异常事件，"
        "集中在一块屏上。数据来自国产时序数据库，秒级刷新。")),
    dict(key="alerts", anim_min=6.0, tail=1.4, narration=(
        "当任意测点突破历史极值时，系统秒级判定并推送企业微信。不用刷新、不用盯盘，异常自己会找上门。")),
    dict(key="drawer", anim_min=8.0, tail=1.8, narration=(
        "点击异常，后台的智能体马上开始一轮完整分析：先核实历史趋势，判断是真异常还是单点毛刺；"
        "再检索知识库里的工艺文档、安全联锁和故障影响链；最后给出一份结构化报告——"
        "结论、可能原因、处置建议、依据来源，全都写清楚，可追溯、不编造。")),
    dict(key="closedloop", anim_min=6.0, tail=1.8, narration=(
        "发现异常只是第一步。值班员在这里登记处理人和根因分类，形成完整的时间线——"
        "谁、在什么时候、因为什么、怎么处理的，一条不落。")),
    dict(key="breadth", anim_min=17.5, tail=1.4, narration=(
        "除了异常闭环，它还提供工艺流程与异常联动、按班次和周期的自动报表，"
        "以及任意测点的历史回查。过去要导几个表格的活，现在一块屏搞定。")),
    dict(key="qa", anim_min=18.5, tail=1.8, narration=(
        "它不只是看板，还是一个懂工艺的助手。你可以直接问它工艺问题，它会给出带文档出处的答案；"
        "也可以动口不动手，用语音问当前工况。")),
    dict(key="end", anim_min=6.0, tail=2.6, narration=(
        "从秒级发现，到自动分析，再到闭环沉淀——让每一条异常都有结论、有依据、有交代。"
        "这就是窑炉传感器中控台，和它背后的智能制造全链路智能体。")),
]

_SPLIT_RE = re.compile(r"(?<=[。！？；])|(?<=，)|(?<=——)|(?<=、)")


# ---------------------------------------------------------------- 工具函数
def ffmpeg_exe():
    p = shutil.which("ffmpeg")
    if p:
        return p
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    for p in glob.glob(os.path.expanduser("~/.cache/ms-playwright/ffmpeg-*/ffmpeg-linux")):
        return p
    raise SystemExit("找不到 ffmpeg，请先安装（pip install imageio-ffmpeg）")


def ffprobe_dur(path):
    ff = ffmpeg_exe()
    out = subprocess.run([ff, "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
    if not m:
        return 0.0
    h, mm, s = m.groups()
    return int(h) * 3600 + int(mm) * 60 + float(s)


def split_clauses(text):
    parts = [p.strip() for p in _SPLIT_RE.split(text) if p.strip()]
    merged = []
    for p in parts:
        if merged and len(merged[-1]) < 5:
            merged[-1] += p
        else:
            merged.append(p)
    return merged


def gap_for(clause):
    """句间留白：句末标点停顿略长，逗号/顿号略短。"""
    if clause.endswith(("。", "！", "？", "；")):
        return 0.30
    if clause.endswith("——"):
        return 0.22
    return 0.13


async def synth_tts(text, path):
    import edge_tts
    await edge_tts.Communicate(text, VOICE, rate=RATE).save(path)


def trim_silence(src, dst):
    """去掉 TTS 片段首尾的静音（edge-tts 每段自带约 0.4s），使句间停顿可控。"""
    ff = ffmpeg_exe()
    af = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,"
          "areverse,"
          "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,"
          "areverse")
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", src, "-af", af,
                    "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", dst],
                   check=True, capture_output=True)


def find_playwright():
    for c in sorted(glob.glob(os.path.expanduser("~/.npm/_npx/*/node_modules/playwright"))):
        if os.path.exists(os.path.join(c, "package.json")):
            return c
    raise SystemExit("找不到 playwright 模块（~/.npm/_npx/*/node_modules/playwright）")


# ---------------------------------------------------------------- 时间轴
def build_timeline(no_tts=False):
    scenes, audio_clips = [], []
    t = 0.0
    for sc in SCENES:
        clauses = split_clauses(sc["narration"])
        subs = []
        offset = 0.0
        if no_tts:
            span = max(sc["anim_min"], 1.0) / max(1, len(clauses))
            for i, cl in enumerate(clauses):
                subs.append({"t": round(i * span, 2), "d": round(span, 2), "text": cl})
            audio_total = 0.0
        else:
            for i, cl in enumerate(clauses):
                raw = os.path.join(HERE, f"tts_{sc['key']}_{i}.mp3")
                clip = os.path.join(HERE, f"tts_{sc['key']}_{i}.wav")  # 去首尾静音后的版本
                if not os.path.exists(raw):
                    print(f"  · 配音 {sc['key']}[{i}] {cl[:16]}…")
                    asyncio.run(synth_tts(cl, raw))
                if not os.path.exists(clip):
                    trim_silence(raw, clip)
                dur = ffprobe_dur(clip)
                audio_clips.append({"path": clip, "start": t + offset, "dur": dur})
                subs.append({"t": round(offset, 2), "d": round(dur, 2), "text": cl})
                offset += dur + gap_for(cl)
            audio_total = max(0.0, offset - gap_for(clauses[-1]))

        dur = round(max(sc["anim_min"], audio_total + sc["tail"]), 2)
        scenes.append(dict(key=sc["key"], start=round(t, 2), dur=dur, subs=subs))
        t += dur
    return scenes, round(t + 1.0, 2), audio_clips


def write_html(timeline):
    html = open(TEMPLATE, encoding="utf-8").read()
    open(DEMO_HTML, "w", encoding="utf-8").write(
        html.replace("__TIMELINE_JSON__", json.dumps(timeline, ensure_ascii=False)))


def build_audio(audio_clips, total):
    ff = ffmpeg_exe()
    inputs, delays, n = [], [], 0
    for c in audio_clips:
        if c["dur"] <= 0:
            continue
        inputs += ["-i", c["path"]]
        ms = int(c["start"] * 1000)
        delays.append(f"[{n}:a]adelay={ms}|{ms}[a{n}]")
        n += 1
    if n == 0:
        subprocess.run([ff, "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
                        "-t", str(total), "-c:a", "aac", "-b:a", "192k", AUDIO],
                       check=True, capture_output=True)
        return
    fc = ";".join(delays) + ";" + "".join(f"[a{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0,apad[aout]"
    print(f"  · 合成配音轨（{n} 句）…")
    subprocess.run([ff, "-y", *inputs, "-filter_complex", fc, "-map", "[aout]",
                    "-t", str(total), "-c:a", "aac", "-b:a", "192k", AUDIO],
                   check=True, capture_output=True)


# ---------------------------------------------------------------- 录屏 / 合成
def measure_k(video, total):
    """用顶部进度条宽度反推「页面时间 / 视频时间」比值 k（正常 1.0；视频被拉长时 <1）。"""
    try:
        import numpy as np
        from PIL import Image
    except Exception:
        return 1.0
    ff = ffmpeg_exe()
    dur = ffprobe_dur(video)
    if dur <= 5:
        return 1.0
    xs, ys, tmp = [], [], os.path.join(HERE, "_pb.png")
    step = max(6, int(dur) // 16)
    for tt in range(10, int(dur) - 3, step):
        try:
            subprocess.run([ff, "-y", "-loglevel", "error", "-ss", str(tt), "-i", video,
                            "-frames:v", "1", "-vf", "crop=1920:6:0:0", tmp], check=True)
            a = np.asarray(Image.open(tmp).convert("RGB")).astype(int)[2]
            mask = (a[:, 2] > 140) & (a[:, 2] > a[:, 0] + 30) & (a[:, 1] > 80)
            idx = np.where(mask)[0]
            if len(idx):
                page = (int(idx.max()) + 1) / 1920 * total
                if page < total - 1:
                    xs.append(tt); ys.append(page)
        except Exception:
            continue
    if os.path.exists(tmp):
        os.remove(tmp)
    if len(xs) < 4:
        return 1.0
    k, _c = np.polyfit(np.array(xs, float), np.array(ys, float), 1)
    if not (0.6 <= k <= 1.05) or np.corrcoef(xs, ys)[0, 1] < 0.98:
        return 1.0
    print(f"  · 时钟拟合：k={k:.4f}（1.0 为同步）")
    return float(k)


def record(total):
    pw = find_playwright()
    print(f"  · Playwright 录制 {total:.0f}s …")
    env = dict(os.environ, PW_MODULE=pw, DEMO_HTML=DEMO_HTML, RAW_OUT=RAW, TOTAL_SEC=str(total))
    subprocess.run(["node", os.path.join(HERE, "record.cjs")], check=True, env=env)


def mux():
    ff = ffmpeg_exe()
    total = json.load(open(TIMELINE, encoding="utf-8"))["total"] if os.path.exists(TIMELINE) else 0
    k = measure_k(RAW, total) if os.path.exists(RAW) and total else 1.0
    print("  · ffmpeg 合成 mp4 …" + (f"（回拉实时 ×{k:.4f}）" if k < 0.99 else ""))
    cmd = [ff, "-y", "-i", RAW]
    if os.path.exists(AUDIO):
        cmd += ["-i", AUDIO]
    if k < 0.99:
        cmd += ["-filter_complex", f"[0:v]setpts={k:.6f}*PTS[v]", "-map", "[v]"]
    else:
        cmd += ["-map", "0:v:0"]
    if os.path.exists(AUDIO):
        cmd += ["-map", "1:a:0", "-c:a", "aac", "-b:a", "192k"]
    cmd += ["-r", "25", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium",
            "-movflags", "+faststart", "-shortest", OUT]
    subprocess.run(cmd, check=True, capture_output=True)
    print(f"\n✅ 完成：{OUT}  ({os.path.getsize(OUT)/1024/1024:.1f} MB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-record", action="store_true")
    ap.add_argument("--no-tts", action="store_true")
    ap.add_argument("--only-mux", action="store_true")
    a = ap.parse_args()
    if a.only_mux:
        mux(); return
    print("① 生成时间轴与配音 …")
    scenes, total, clips = build_timeline(no_tts=a.no_tts)
    timeline = {"total": total, "scenes": scenes}
    json.dump(timeline, open(TIMELINE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    write_html(timeline)
    print(f"   demo.html / timeline.json 已生成，总时长 {total:.1f}s")
    if not a.no_tts:
        build_audio(clips, total)
    if a.skip_record:
        print("已跳过录屏（--skip-record）。可直接浏览器打开 demo.html。")
        return
    print("② 录屏 …"); record(total)
    print("③ 合成 …"); mux()


if __name__ == "__main__":
    main()
