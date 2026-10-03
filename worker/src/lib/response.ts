import type { ApiResp } from '../types';

/**
 * Unified JSON response helpers.
 *
 * Envelope shape: { code, data, message }
 *   - success: code 0, message 'ok'
 *   - failure: code !== 0 with a human-readable message
 *
 * Error-code conventions:
 *   0   成功 | 400 参数错误 | 401 未登录/口令错误 | 404 资源不存在
 *   409 冲突(重复) | 422 校验失败 | 429 限流 | 500 内部错误
 */

/** Build a success envelope. */
export function ok<T>(data: T, message = 'ok'): ApiResp<T> {
  return { code: 0, data, message };
}

/** Build a failure envelope. */
export function fail(code: number, message: string, data: unknown = null): ApiResp {
  return { code, data, message };
}

/** Serialize an envelope into a Response with proper content-type. */
export function json<T>(payload: ApiResp<T>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
