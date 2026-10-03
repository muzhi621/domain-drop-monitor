import { describe, it, expect } from 'vitest';
import {
  classifyEvent,
  nextCheckStep,
  normalizeStatus,
  isValidStatus,
  isValidPriority,
  STEP_MINUTES,
  FAILURE_STEP_MINUTES,
  type CheckEvent,
} from '../src/lib/status';
import type { Priority } from '../src/types';

const MIN_MS = 60 * 1000;

describe('status: classifyEvent', () => {
  it('classifies any transition into available as a drop event', () => {
    expect(classifyEvent(null, 'available')).toBe('drop');
    expect(classifyEvent('ok', 'available')).toBe('drop');
    expect(classifyEvent('pendingDelete', 'available')).toBe('drop');
    expect(classifyEvent('expired', 'available')).toBe('drop');
  });

  it('classifies entry into redemptionPeriod / pendingDelete as a warn event', () => {
    expect(classifyEvent(null, 'redemptionPeriod')).toBe('warn');
    expect(classifyEvent('ok', 'redemptionPeriod')).toBe('warn');
    expect(classifyEvent(null, 'pendingDelete')).toBe('warn');
    expect(classifyEvent('ok', 'pendingDelete')).toBe('warn');
    // re-classified as warn even if moving between the two deletion states
    expect(classifyEvent('pendingDelete', 'redemptionPeriod')).toBe('warn');
    expect(classifyEvent('redemptionPeriod', 'pendingDelete')).toBe('warn');
  });

  it('returns null for non-event transitions', () => {
    expect(classifyEvent('ok', 'ok')).toBeNull();
    expect(classifyEvent('ok', 'expired')).toBeNull();
    expect(classifyEvent('ok', 'unknown')).toBeNull();
    expect(classifyEvent('redemptionPeriod', 'ok')).toBeNull();
  });

  it('is typed as CheckEvent', () => {
    const e: CheckEvent = classifyEvent('ok', 'available');
    expect(e).toBe('drop');
  });
});

describe('status: nextCheckStep (adaptive scheduling)', () => {
  it('returns the correct minute step per priority', () => {
    expect(nextCheckStep('high', false)).toBe(5);
    expect(nextCheckStep('normal', false)).toBe(60);
    expect(nextCheckStep('low', false)).toBe(360);
  });

  it('returns the failure step (2 min) when a check fails', () => {
    expect(nextCheckStep('high', true)).toBe(2);
    expect(nextCheckStep('normal', true)).toBe(2);
    expect(nextCheckStep('low', true)).toBe(2);
  });

  it('maps priority steps to the documented millisecond values', () => {
    expect(STEP_MINUTES.high * MIN_MS).toBe(300_000);      // 5 min
    expect(STEP_MINUTES.normal * MIN_MS).toBe(3_600_000);  // 1 h
    expect(STEP_MINUTES.low * MIN_MS).toBe(21_600_000);    // 6 h
    expect(FAILURE_STEP_MINUTES * MIN_MS).toBe(120_000);   // 2 min retry
  });

  it('falls back to the normal step for an unknown priority', () => {
    // @ts-ignore - intentionally passing an invalid priority to test the fallback
    expect(nextCheckStep('weird' as Priority, false)).toBe(60);
  });
});

describe('status: normalizeStatus / validators', () => {
  it('normalizeStatus keeps valid EPP statuses and defaults others to unknown', () => {
    expect(normalizeStatus('ok')).toBe('ok');
    expect(normalizeStatus('expired')).toBe('expired');
    expect(normalizeStatus('redemptionPeriod')).toBe('redemptionPeriod');
    expect(normalizeStatus('pendingDelete')).toBe('pendingDelete');
    expect(normalizeStatus('available')).toBe('available');
    expect(normalizeStatus('unknown')).toBe('unknown');
    expect(normalizeStatus(null)).toBe('unknown');
    expect(normalizeStatus(undefined)).toBe('unknown');
    expect(normalizeStatus('')).toBe('unknown');
    expect(normalizeStatus('bogus')).toBe('unknown');
  });

  it('isValidStatus', () => {
    expect(isValidStatus('ok')).toBe(true);
    expect(isValidStatus('available')).toBe(true);
    expect(isValidStatus('nope')).toBe(false);
  });

  it('isValidPriority', () => {
    for (const p of ['high', 'normal', 'low']) expect(isValidPriority(p)).toBe(true);
    expect(isValidPriority('urgent')).toBe(false);
  });
});
