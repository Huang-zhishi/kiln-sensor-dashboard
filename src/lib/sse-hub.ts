// SSE Hub：服务端单点查询 + 广播
// 相同查询参数的浏览器归入同一分组，每组每个 tick 只查一次库，
// 结果变化才推送；无客户端时自动停表

import { fetchDashboardData, fetchSensorsData } from '@/lib/dashboard-data';

interface Client {
  write: (chunk: string) => void;
}

interface Group {
  clients: Set<Client>;
  lastBody: string; // 上次推送的内容（去重，避免重复推送相同数据）
  lastPing: number; // 上次心跳时间（保活，防代理断连）
  params: Record<string, string>;
}

const TICK_MS = 2000;
const PING_MS = 25000;

class SseHub {
  private groups = new Map<string, Group>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  subscribe(key: string, params: Record<string, string>, client: Client) {
    let group = this.groups.get(key);
    if (!group) {
      group = { clients: new Set(), lastBody: '', lastPing: Date.now(), params };
      this.groups.set(key, group);
    }
    group.clients.add(client);
    this.ensureTimer();
    // 新订阅者尽快收到首帧数据
    this.kick();
  }

  unsubscribe(key: string, client: Client) {
    const group = this.groups.get(key);
    if (!group) return;
    group.clients.delete(client);
    if (group.clients.size === 0) this.groups.delete(key);
    if (this.groups.size === 0) this.stopTimer();
  }

  get clientCount(): number {
    let n = 0;
    for (const g of this.groups.values()) n += g.clients.size;
    return n;
  }

  private ensureTimer() {
    if (!this.timer) {
      this.timer = setInterval(() => void this.tick(), TICK_MS);
      // 不阻止进程退出
      this.timer.unref?.();
    }
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private kick() {
    setTimeout(() => void this.tick(), 50);
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const [key, group] of [...this.groups]) {
        // 清理无效分组
        if (group.clients.size === 0) {
          this.groups.delete(key);
          continue;
        }

        let body: string;
        try {
          const payload = group.params.type === 'sensors'
            ? await fetchSensorsData(group.params.time_range || '1h')
            : await fetchDashboardData({
                kiln_id: group.params.kiln_id || '',
                time_range: group.params.time_range || '12h',
                sensors: 'sensors' in group.params
                  ? group.params.sensors.split(',').map((s) => s.trim()).filter(Boolean)
                  : null,
              });
          body = JSON.stringify(payload);
        } catch (err) {
          console.error('SSE tick query error:', err);
          continue;
        }

        const now = Date.now();
        if (body !== group.lastBody) {
          group.lastBody = body;
          const frame = `data: ${body}\n\n`;
          for (const client of [...group.clients]) {
            try {
              client.write(frame);
            } catch {
              group.clients.delete(client);
            }
          }
        } else if (now - group.lastPing > PING_MS) {
          group.lastPing = now;
          for (const client of [...group.clients]) {
            try {
              client.write(`: ping\n\n`);
            } catch {
              group.clients.delete(client);
            }
          }
        }
      }
    } finally {
      this.ticking = false;
    }
  }
}

// 挂在 globalThis 上，避免 dev 模式 HMR 重建模块时丢失连接分组
const globalForHub = globalThis as unknown as { __sseHub?: SseHub };
export const sseHub = globalForHub.__sseHub ?? (globalForHub.__sseHub = new SseHub());
