// Unified API client: fetch wrapper with credentials + envelope parsing.

export type EppStatus =
  | 'ok'
  | 'expired'
  | 'redemptionPeriod'
  | 'pendingDelete'
  | 'available'
  | 'unknown';

export type Priority = 'high' | 'normal' | 'low';
export type Channel = 'email' | 'telegram' | 'pushplus' | 'webhook' | 'wecom';

export interface Domain {
  id: number;
  domain: string;
  status: EppStatus;
  group_name: string;
  tags: string;
  note: string;
  priority: Priority;
  next_check_at: number;
  last_checked_at: number | null;
  last_notify_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface StatusHistory {
  id: number;
  domain: string;
  old_status: EppStatus | null;
  new_status: EppStatus;
  changed_at: number;
  trigger_action: string;
}

export interface NotifConfig {
  id: number;
  channel: Channel;
  enabled: boolean;
  recipient: string;
  suppress_interval_minutes: number;
  updated_at: number;
}

export interface ApiResp<T = unknown> {
  code: number;
  data: T | null;
  message: string;
}

export interface ApiError extends Error {
  code?: number;
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResp<T>> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: {},
  };
  if (body !== undefined) {
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const resp = await fetch(url, init);
  const text = await resp.text();
  let data: ApiResp<T>;
  try {
    data = JSON.parse(text) as ApiResp<T>;
  } catch {
    data = { code: resp.status, data: null, message: text || resp.statusText || '请求失败' };
  }

  if (data.code !== 0) {
    const err: ApiError = new Error(data.message || '请求失败');
    err.code = data.code;
    throw err;
  }
  return data;
}

export function apiGet<T>(path: string): Promise<ApiResp<T>> {
  return request<T>('GET', path);
}
export function apiPost<T>(path: string, body?: unknown): Promise<ApiResp<T>> {
  return request<T>('POST', path, body);
}
export function apiPut<T>(path: string, body?: unknown): Promise<ApiResp<T>> {
  return request<T>('PUT', path, body);
}
export function apiDelete<T>(path: string): Promise<ApiResp<T>> {
  return request<T>('DELETE', path);
}
