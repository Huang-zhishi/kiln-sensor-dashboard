# 演示视频生成（HTML 动画 → 录屏 → MP4）

把 `docs/演示视频分镜脚本.md` 自动渲染成一段带中文配音、字幕、进度条的 3 分钟演示视频。

## 产物

| 文件 | 说明 |
|---|---|
| `窑炉中控台演示.mp4` | **最终成片**（1920×1080 / 25fps / H.264 + AAC），约 2:05 |
| `demo.html` | 可交互演示页，浏览器打开即可全屏播放（含配音轨） |
| `template.html` | 演示页模板（动画与布局源码，`__TIMELINE_JSON__` 为注入点） |
| `build.py` | 一键流水线：配音 → 时间轴 → 渲染 → 录屏 → 合成 |
| `record.cjs` | Playwright 录屏脚本 |
| `timeline.json` | 由旁白时长自动生成的时间轴（各幕起止 + 字幕） |
| `audio.m4a` | 合成后的中文配音轨 |
| `tts_<key>_<i>.mp3` | 逐句旁白原文（edge-tts 生成，可缓存复用） |
| `tts_<key>_<i>.wav` | 去首尾静音后的逐句配音（真正参与合成与字幕计时） |
| `raw.webm` | Playwright 原始录屏（合成前的中间产物） |

## 一键重新生成

```bash
cd demo-video
python3 build.py
```

依赖（本机已具备）：
- 中文 TTS：`python3 -m pip install --user --break-system-packages edge-tts`
- 编码 ffmpeg：`python3 -m pip install --user --break-system-packages imageio-ffmpeg`（自带 libx264/aac）
- 录屏：Playwright（Chromium）——脚本会自动在 `~/.npm/_npx/*/node_modules/playwright` 里查找

常用参数：

```bash
python3 build.py --skip-record   # 只生成 demo.html / timeline.json / audio.m4a（浏览器预览）
python3 build.py --no-tts        # 不配音（纯字幕）
python3 build.py --only-mux      # 已有 raw.webm + audio.m4a，只重新合成 mp4
```

## 改文案 / 改时长

- **旁白文案**：改 `build.py` 里的 `SCENES[].narration`；
- **期望时长**：改 `SCENES[].planned`（实际时长 = `max(planned, 配音时长 + 0.9s)`）；
- **画面与动画**：改 `template.html`（每幕对应 `ANIM.<key>()`）。

改完旁白后如需重新配音，先删掉对应的 `tts_*.mp3` 再跑 `build.py`。

## 关于音画同步（重要）

字幕与配音的对齐靠两条机制保证：

1. **逐句配音**：旁白按标点切成短句，**每句单独合成一段 TTS**，字幕的起止时间就是该句配音的
   起止时间——不做「整幕均分时长」的估算，因此不存在句内漂移。句间停顿由 `gap_for()` 控制，
   并用 ffmpeg `silenceremove` 去掉 edge-tts 每段自带的约 0.4s 首尾静音，避免停顿过长。
2. **幕长 = max(动画最短时长, 本幕配音总时长 + 留白)**：字幕不会被拖到无声的长尾里。

此外，headless Chromium 在录屏时渲染速度可能慢于录制器时钟，导致视频被**拉长**（本机实测约 ×0.883）。
`build.py` 的合成步骤会用画面顶部进度条反推这个比例 `k`，再用 `setpts=k*PTS` 把视频压回实时，
从而与**自然语速**的配音对齐（相关系数 1.0）。因此若你手工用别的方式录制，需注意这一点。

> 时长说明：逐句对齐 + 紧凑剪辑后成片约 2:05。若想拉长到约 3 分钟，调大 `SCENES[].tail`
> 即可（尾部留白是无字幕的静默，不会造成不同步）。

## 说明

- 视频中的数值、测点（如 `2#冷却器出口温度 TI_809`、248.10℃ / 历史 0~229.20℃ / 峰值 324.80℃）与功能
  均对齐真实系统；本演示页为**仿真界面**，不连接后端，可离线播放与录制。
- 生成的 mp4/webm/mp3/m4a/demo.html/timeline.json 属构建产物，见 `.gitignore`。
