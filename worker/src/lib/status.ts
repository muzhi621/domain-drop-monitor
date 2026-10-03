import type { EppStatus, Priority } from '../types';

/**
 * Status-transition classification & scheduling helpers.
 */

/** Notification event derived from a status change. */
export type CheckEvent = 'drop' | 'warn' | null;

/**
 * Classify a status transition into a notification event.
 *  - 'drop'  : domain became available (可注册)
 *  - 'warn'  : first entered redemptionPeriod / pendingDelete (预警)
 */
export function classifyEvent(oldStatus: EppStatus | null, newStatus: EppStatus): CheckEvent {
  if (newStatus === 'available') return 'drop';
  if (newStatus === 'redemptionPeriod' || newStatus === 'pendingDelete') return 'warn';
  return null;
}

/** Adaptive next_check_at step (minutes) by priority. */
export const STEP_MINUTES: Record<Priority, number> = {
  high: 5,
  normal: 60,
  low: 360,
};

/** Retry step (minutes) when a check fails (status = unknown). */
export const FAILURE_STEP_MINUTES = 2;

export function nextCheckStep(priority: Priority, failed: boolean): number {
  if (failed) return FAILURE_STEP_MINUTES;
  return STEP_MINUTES[priority] ?? STEP_MINUTES.normal;
}

const VALID_STATUSES: EppStatus[] = [
  'ok',
  'expired',
  'redemptionPeriod',
  'pendingDelete',
  'available',
  'unknown',
];

export function isValidStatus(value: string): value is EppStatus {
  return (VALID_STATUSES as string[]).includes(value);
}

const VALID_PRIORITIES: Priority[] = ['high', 'normal', 'low'];

export function isValidPriority(value: string): value is Priority {
  return (VALID_PRIORITIES as string[]).includes(value);
}

export function normalizeStatus(value: string | null | undefined): EppStatus {
  return isValidStatus(value ?? '') ? (value as EppStatus) : 'unknown';
}
