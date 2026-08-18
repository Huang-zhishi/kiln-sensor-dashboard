// 统一 API 请求封装：可选附加访问令牌（服务端配置 API_ACCESS_TOKEN 时生效）
// 令牌由根布局在服务端注入 window.__API_TOKEN__，见 src/app/layout.tsx

declare global {
  interface Window {
    __API_TOKEN__?: string;
  }
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = typeof window !== 'undefined' ? window.__API_TOKEN__ : undefined;
  if (token) {
    headers.set('x-api-token', token);
  }
  return fetch(input, { ...init, headers });
}
