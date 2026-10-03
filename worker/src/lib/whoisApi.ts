import type { EppStatus } from '../types';
import type { Env } from '../env';

export interface WhoisResult {
  status: EppStatus;
  raw?: unknown;
}

/**
 * Paid WHOIS / availability API fallback, used for .cn when RDAP is
 * unavailable. Endpoint & key come from Secrets (WHOIS_API_BASE / WHOIS_API_KEY).
 *
 * The exact upstream response shape varies by provider; normalizeWhois applies a
 * generic heuristic so the system keeps working across providers.
 */
export class WhoisApiClient {
  constructor(private readonly env: Env) {}

  async lookup(domain: string): Promise<WhoisResult> {
    const base = this.env.WHOIS_API_BASE;
    const key = this.env.WHOIS_API_KEY;
    if (!base || !key) return { status: 'unknown' };

    const sep = base.includes('?') ? '&' : '?';
    const url = `${base.replace(/\/$/, '')}${sep}domain=${encodeURIComponent(domain)}&apiKey=${encodeURIComponent(key)}`;

    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return { status: 'unknown' };

    const data = await resp.json().catch(() => null);
    return { status: normalizeWhois(data), raw: data };
  }
}

/** Generic WHOIS/availability JSON normalizer (provider-agnostic). */
export function normalizeWhois(data: unknown): EppStatus {
  if (!data || typeof data !== 'object') return 'unknown';
  const text = JSON.stringify(data).toLowerCase();

  if (
    (data as { available?: boolean }).available === true ||
    text.includes('"available":true') ||
    text.includes('no match') ||
    text.includes('not found') ||
    text.includes('no entries found')
  ) {
    return 'available';
  }

  if (text.includes('redemption') && text.includes('period')) return 'redemptionPeriod';
  if (text.includes('pending delete') || text.includes('pendingdelete')) return 'pendingDelete';
  if (text.includes('expired') && !text.includes('not expired')) return 'expired';

  // Domain present, no deletion markers -> currently registered.
  return 'ok';
}
