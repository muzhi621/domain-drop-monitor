import type { Env } from '../env';

/**
 * Session cookie auth using HMAC-SHA256 (Web Crypto).
 *
 * Cookie name: dm_session
 * Value:  base64url(payload).base64url(HMAC_SHA256(payload, SESSION_SECRET))
 * payload: { admin: 1, exp: epochSeconds }
 * Attributes: HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800 (7d)
 */

const COOKIE_NAME = 'dm_session';
export const MAX_AGE_SECONDS = 604800; // 7 days

interface SessionPayload {
  admin: number;
  exp: number; // epoch seconds
}

function toBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function fromBytes(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function base64urlEncode(bytes: Uint8Array): string {
  return btoa(fromBytes(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    toBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return new Uint8Array(sig);
}

/** Create a signed session token. */
export async function signSession(env: Env): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { admin: 1, exp: nowSec + MAX_AGE_SECONDS };
  const payloadB64 = base64urlEncode(toBytes(JSON.stringify(payload)));
  const sig = await hmac(env.SESSION_SECRET, toBytes(payloadB64));
  return `${payloadB64}.${base64urlEncode(sig)}`;
}

/** Verify a raw session token value (NOT the full Cookie header). */
export async function verifySession(env: Env, token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  const expected = base64urlEncode(await hmac(env.SESSION_SECRET, toBytes(payloadB64)));
  if (expected.length !== sigB64.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sigB64.charCodeAt(i);
  }
  if (diff !== 0) return false;
  try {
    const payload = JSON.parse(fromBytes(base64urlDecode(payloadB64))) as SessionPayload;
    if (!payload || payload.admin !== 1) return false;
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Build the Set-Cookie header value for login (or logout with max-age 0). */
export function buildCookie(token: string, maxAge: number = MAX_AGE_SECONDS, secure = true): string {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    ...(secure ? ['Secure'] : []),
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  return attrs.join('; ');
}

/** Extract a named cookie value from a Cookie header string. */
export function parseCookie(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export { COOKIE_NAME };
