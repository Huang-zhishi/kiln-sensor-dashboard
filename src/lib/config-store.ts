// 运行期配置存储：JSON 文件，原子写（写临时文件再 rename）
// 目录挂载到宿主机 ./data/config，重建容器不丢。
// 适用：告警规则、测点元数据等「可变配置」；时序数据仍走 TDengine。

import fs from 'fs';
import path from 'path';

const CONFIG_DIR = path.join(process.cwd(), 'data', 'config');

export function configDir(): string {
  return CONFIG_DIR;
}

function ensureDir(): void {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  } catch (err) {
    console.error('[config-store] 创建配置目录失败:', err);
  }
}

export function readConfig<T>(file: string, fallback: T): T {
  try {
    const full = path.join(CONFIG_DIR, file);
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, 'utf-8')) as T;
  } catch (err) {
    console.error(`[config-store] 读取 ${file} 失败:`, err);
    return fallback;
  }
}

export function writeConfig<T>(file: string, data: T): void {
  ensureDir();
  const full = path.join(CONFIG_DIR, file);
  const tmp = `${full}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, full);
}
