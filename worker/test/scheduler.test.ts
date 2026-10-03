import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDueChecks } from '../src/lib/scheduler';
import type { Env } from '../src/env';
import type { Domain, NotifConfig } from '../src/types';

// dispatchMock must be hoisted above the vi.mock factory, so use vi.hoisted.
const { dispatchMock } = vi.hoisted(() => ({ dispatchMock: vi.fn() }));

vi.mock('../src/lib/db', () => ({
  getDueDomains: vi.fn(),
  getNotifConfigs: vi.fn(),
  hasWarned: vi.fn(),
  insertHistory: vi.fn(),
  pruneHistory: vi.fn(),
  setNextCheck: vi.fn(),
  updateDomainStatus: vi.fn(),
  updateLastChecked: vi.fn(),
  updateLastNotify: vi.fn(),
}));

vi.mock('../src/lib/checker', () => ({
  checkAvailability: vi.fn(),
}));

vi.mock('../src/lib/notifier', () => ({
  dispatch: (...args: any[]) => dispatchMock(...args),
}));

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
} from '../src/lib/db';
import { checkAvailability } from '../src/lib/checker';

const env = {} as unknown as Env;

function baseDomain(overrides: Partial<Domain> = {}): Domain {
  return {
    id: 1,
    domain: 'a.com',
    status: 'pendingDelete',
    group_name: '默认',
    tags: '',
    note: '',
    priority: 'normal',
    next_check_at: 0,
    last_checked_at: null,
    last_notify_at: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

function cfg(overrides: Partial<NotifConfig> = {}): NotifConfig {
  return {
    id: 1,
    channel: 'webhook',
    enabled: true,
    recipient: 'http://h',
    suppress_interval_minutes: 30,
    updated_at: 0,
    ...overrides,
  };
}

describe('scheduler: per-domain suppression (real logic lives here, not in notifier)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    dispatchMock.mockReset();
    dispatchMock.mockResolvedValue({ sent: true, channelCount: 1, errors: [] });
    for (const f of [
      getDueDomains,
      getNotifConfigs,
      hasWarned,
      checkAvailability,
      insertHistory,
      pruneHistory,
      setNextCheck,
      updateDomainStatus,
      updateLastChecked,
      updateLastNotify,
    ]) {
      vi.mocked(f).mockReset();
    }
    vi.mocked(getNotifConfigs).mockResolvedValue([cfg()]);
    vi.mocked(hasWarned).mockResolvedValue(false);
    vi.mocked(checkAvailability).mockResolvedValue({ status: 'available', checkedAt: Date.now(), source: 'rdap' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('suppresses a drop when last_notify_at is inside the suppress window', async () => {
    const now = Date.now();
    vi.mocked(getDueDomains).mockResolvedValue([baseDomain({ last_notify_at: now })]);
    await runDueChecks(env);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('dispatches a drop when last_notify_at is older than the suppress interval', async () => {
    const now = Date.now();
    vi.mocked(getDueDomains).mockResolvedValue([baseDomain({ last_notify_at: now - 60 * 60 * 1000 })]);
    await runDueChecks(env);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it('dispatches when last_notify_at is null', async () => {
    vi.mocked(getDueDomains).mockResolvedValue([baseDomain({ last_notify_at: null })]);
    await runDueChecks(env);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT suppress when the min suppress interval is 0', async () => {
    vi.mocked(getNotifConfigs).mockResolvedValue([cfg({ suppress_interval_minutes: 0 })]);
    const now = Date.now();
    vi.mocked(getDueDomains).mockResolvedValue([baseDomain({ last_notify_at: now })]); // would be suppressed if > 0
    await runDueChecks(env);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it('dispatches a warn event on first entry to redemptionPeriod', async () => {
    vi.mocked(checkAvailability).mockResolvedValue({ status: 'redemptionPeriod', checkedAt: Date.now(), source: 'rdap' });
    vi.mocked(getDueDomains).mockResolvedValue([baseDomain({ status: 'ok', last_notify_at: null })]);
    await runDueChecks(env);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const arg = dispatchMock.mock.calls[0][1];
    expect(arg.event).toBe('warn');
  });

  it('skips the warn dispatch if it has already been warned (hasWarned=true)', async () => {
    vi.mocked(checkAvailability).mockResolvedValue({ status: 'redemptionPeriod', checkedAt: Date.now(), source: 'rdap' });
    vi.mocked(hasWarned).mockResolvedValue(true);
    vi.mocked(getDueDomains).mockResolvedValue([baseDomain({ status: 'ok', last_notify_at: null })]);
    await runDueChecks(env);
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
