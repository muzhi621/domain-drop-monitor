/**
 * Shared domain types used across the Worker.
 */

/** Normalized EPP-style availability status. */
export type EppStatus =
  | 'ok' // 正常注册中
  | 'expired' // 已过期（未进赎回期）
  | 'redemptionPeriod' // 赎回期
  | 'pendingDelete' // 删除期（临近 drop）
  | 'available' // 未注册 / 已释放（可注册 = drop）
  | 'unknown'; // 检测失败 / 无法判定

/** Detection priority — controls the adaptive next_check_at step. */
export type Priority = 'high' | 'normal' | 'low';

/** Notification channel identifiers. */
export type Channel = 'email' | 'telegram' | 'pushplus' | 'webhook' | 'wecom';

/** Unified API response envelope. */
export interface ApiResp<T = unknown> {
  code: number;
  data: T | null;
  message: string;
}

/** A monitored domain row. */
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

/** Status-change history row. */
export interface StatusHistory {
  id: number;
  domain: string;
  old_status: EppStatus | null;
  new_status: EppStatus;
  changed_at: number;
  trigger_action: string;
}

/** Notification channel configuration (credentials live in Secrets, never here). */
export interface NotifConfig {
  id: number;
  channel: Channel;
  enabled: boolean;
  recipient: string;
  suppress_interval_minutes: number;
  updated_at: number;
}

/** Result of a single availability check. */
export interface CheckResult {
  domain: string;
  status: EppStatus;
  source: 'rdap' | 'whois-api';
  raw?: unknown;
  checkedAt: number;
}
