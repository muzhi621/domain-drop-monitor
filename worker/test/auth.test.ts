import { describe, it, expect, vi } from 'vitest';
import { signSession, verifySession, buildCookie, parseCookie, MAX_AGE_SECONDS } from '../src/lib/auth';
import type { Env } from '../src/env';

const baseEnv: Env = {
  DB: {} as any,
  ADMIN_PASSWORD: 'pw',
  SESSION_SECRET: 'super-secret-key-at-least-32-bytes-long!!',
  RESEND_API_KEY: '',
  TG_BOT_TOKEN: '',
  TG_CHAT_ID: '',
  PUSHPLUS_TOKEN: '',
  NOTIF_WEBHOOK_URL: '',
  WECOM_WEBHOOK_URL: '',
  WHOIS_API_BASE: '',
  WHOIS_API_KEY: '',
};

const otherEnv: Env = { ...baseEnv, SESSION_SECRET: 'a-different-secret-key-also-long-enough-32!' };

describe('auth: sign/verify roundtrip', () => {
  it('a freshly signed session verifies true', async () => {
    const token = await signSession(baseEnv);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(2);
    expect(await verifySession(baseEnv, token)).toBe(true);
  });

  it('rejects empty / malformed tokens', async () => {
    expect(await verifySession(baseEnv, null)).toBe(false);
    expect(await verifySession(baseEnv, undefined)).toBe(false);
    expect(await verifySession(baseEnv, '')).toBe(false);
    expect(await verifySession(baseEnv, 'not-a-token')).toBe(false);
    expect(await verifySession(baseEnv, 'a.b.c')).toBe(false);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession(baseEnv);
    expect(await verifySession(otherEnv, token)).toBe(false);
  });

  it('rejects a tampered payload', async () => {
    const token = await signSession(baseEnv);
    const [payload, sig] = token.split('.');
    const flipped = payload.slice(0, -1) + (payload.slice(-1) === 'A' ? 'B' : 'A');
    expect(await verifySession(baseEnv, `${flipped}.${sig}`)).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const token = await signSession(baseEnv);
    const [payload, sig] = token.split('.');
    const flipped = sig.slice(0, -1) + (sig.slice(-1) === 'A' ? 'B' : 'A');
    expect(await verifySession(baseEnv, `${payload}.${flipped}`)).toBe(false);
  });

  it('enforces expiry: valid within 7 days, invalid afterwards', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = await signSession(baseEnv);
    expect(await verifySession(baseEnv, token)).toBe(true);
    vi.setSystemTime(new Date('2026-01-09T00:00:00Z')); // +8 days
    expect(await verifySession(baseEnv, token)).toBe(false);
    vi.useRealTimers();
  });

  it('MAX_AGE_SECONDS equals 7 days', () => {
    expect(MAX_AGE_SECONDS).toBe(7 * 24 * 60 * 60);
  });
});

describe('auth: cookie helpers', () => {
  it('buildCookie contains the expected attributes', () => {
    const c = buildCookie('tok');
    expect(c).toContain('dm_session=tok');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toContain(`Max-Age=${MAX_AGE_SECONDS}`);
  });
  it('buildCookie omits Secure when secure=false', () => {
    expect(buildCookie('tok', 100, false)).not.toContain('Secure');
  });
  it('parseCookie extracts a named cookie value', () => {
    expect(parseCookie('a=1; dm_session=abc; b=2', 'dm_session')).toBe('abc');
    expect(parseCookie('a=1', 'dm_session')).toBeNull();
    expect(parseCookie('', 'dm_session')).toBeNull();
    expect(parseCookie('dm_session=hello%20world', 'dm_session')).toBe('hello world');
  });
});
