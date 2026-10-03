import type { Env } from '../env';
import { classifyEvent, nextCheckStep } from './status';
import { checkAvailability } from './checker';
import {
  getDueDomains,
  getNotifConfigs,
  hasWarned,
  insertHistory,
  pruneHistory,
  setNextCheck,
  updateDomainStatus,
  updateLastChecked,
  updateLastNotify,
} from './db';
import { dispatch } from './notifier';

/** Maximum domains checked per cron invocation (free-plan subrequest limit). */
const BATCH_LIMIT = 50;
/** Retain status history for this many days. */
const HISTORY_KEEP_DAYS = 90;

/**
 * Cron batch-check loop.
 *
 * 1. Pull up to BATCH_LIMIT domains whose next_check_at <= now.
 * 2. Check availability, compare with stored status.
 * 3. On change: write history + update status; classify drop/warn and dispatch
 *    notifications (respecting per-domain suppress interval).
 * 4. Adapt next_check_at by priority (or retry step on failure).
 * 5. Periodically prune old history.
 */
export async function runDueChecks(env: Env): Promise<void> {
  const now = Date.now();
  const due = await getDueDomains(env.DB, now, BATCH_LIMIT);
  if (due.length === 0) return;

  const configs = await getNotifConfigs(env.DB);
  const enabled = configs.filter((c) => c.enabled);
  const minSuppressMinutes =
    enabled.length > 0 ? Math.min(...enabled.map((c) => c.suppress_interval_minutes)) : 0;

  for (const d of due) {
    try {
      const result = await checkAvailability(d.domain, env);
      const newStatus = result.status;
      const oldStatus = d.status;
      const checkedAt = result.checkedAt;

      if (newStatus !== oldStatus) {
        await insertHistory(env.DB, {
          domain: d.domain,
          old_status: oldStatus,
          new_status: newStatus,
          changed_at: checkedAt,
          trigger_action: 'check',
        });
        await updateDomainStatus(env.DB, d.id, newStatus, checkedAt);

        const event = classifyEvent(oldStatus, newStatus);
        if (event) {
          const alreadyWarned = event === 'warn' ? await hasWarned(env.DB, d.domain, newStatus) : false;
          const suppressed =
            minSuppressMinutes > 0 && (d.last_notify_at ?? 0) + minSuppressMinutes * 60 * 1000 > now;

          if ((event === 'drop' || !alreadyWarned) && !suppressed) {
            const res = await dispatch(env, {
              domain: d.domain,
              event,
              status: newStatus,
              oldStatus,
              time: checkedAt,
            });
            if (res.sent) {
              await updateLastNotify(env.DB, d.id, now);
              await insertHistory(env.DB, {
                domain: d.domain,
                old_status: oldStatus,
                new_status: newStatus,
                changed_at: now,
                trigger_action: event === 'drop' ? 'drop-notify' : 'warn-notify',
              });
            }
          }
        }
      } else {
        await updateLastChecked(env.DB, d.id, checkedAt);
      }

      const failed = newStatus === 'unknown';
      const step = nextCheckStep(d.priority, failed);
      await setNextCheck(env.DB, d.id, now + step * 60 * 1000, checkedAt);
    } catch (e) {
      console.error(`[scheduler] check failed for ${d.domain}:`, (e as Error).message);
      await setNextCheck(env.DB, d.id, now + 2 * 60 * 1000, now);
    }
  }

  // Periodic history pruning.
  try {
    await pruneHistory(env.DB, HISTORY_KEEP_DAYS);
  } catch (e) {
    console.error('[scheduler] prune failed:', (e as Error).message);
  }
}
