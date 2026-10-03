import type { EppStatus } from '../types';
import { getTld } from './checker';

export interface RdapResult {
  status: EppStatus;
  raw?: unknown;
}

/**
 * RDAP client: IANA bootstrap resolves the authoritative registry RDAP
 * endpoint for a TLD; .cn is queried against rdap.cn directly.
 */
export class RdapClient {
  private bootstrapCache: { data: Record<string, string>; expires: number } | null = null;

  /** Resolve RDAP base URL for a TLD via IANA bootstrap (cached per instance). */
  private async bootstrap(tld: string): Promise<string | null> {
    if (tld === 'cn') return 'https://rdap.cn/';

    if (this.bootstrapCache && this.bootstrapCache.expires > Date.now()) {
      return this.bootstrapCache.data[tld] ?? null;
    }

    try {
      const resp = await fetch('https://data.iana.org/rdap/dns.json', {
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) return null;
      const json = (await resp.json()) as { services?: [string[], string[]][] };
      const map: Record<string, string> = {};
      for (const [tlds, urls] of json.services ?? []) {
        if (urls.length > 0) {
          for (const t of tlds) map[t] = urls[0];
        }
      }
      this.bootstrapCache = { data: map, expires: Date.now() + 24 * 60 * 60 * 1000 };
      return map[tld] ?? null;
    } catch {
      return null;
    }
  }

  /** Look up a domain; returns normalized EPP status. */
  async lookup(domain: string): Promise<RdapResult> {
    const tld = getTld(domain);
    const base = await this.bootstrap(tld);
    if (!base) return { status: 'unknown' };
    return this.query(base, domain);
  }

  private async query(base: string, domain: string): Promise<RdapResult> {
    const url = `${base.replace(/\/$/, '')}/domain/${encodeURIComponent(domain)}`;
    const resp = await fetch(url, {
      headers: { Accept: 'application/rdap+json' },
    });

    // 404 => domain not found => available (drop candidate).
    if (resp.status === 404) return { status: 'available' };
    if (!resp.ok) return { status: 'unknown' };

    const data = await resp.json().catch(() => null);
    if (!data || typeof data !== 'object') return { status: 'unknown' };
    return { status: normalizeRdapStatus(data), raw: data };
  }
}

/** Map raw RDAP object to a normalized EPP status. */
export function normalizeRdapStatus(data: unknown): EppStatus {
  const obj = data as { status?: unknown; events?: { eventAction?: string }[] };
  const statuses: string[] = [];
  if (Array.isArray(obj.status)) {
    for (const s of obj.status) {
      if (typeof s === 'string') statuses.push(s.toLowerCase());
      else if (s && typeof s === 'object' && 'status' in s && typeof (s as { status: unknown }).status === 'string') {
        statuses.push(String((s as { status: unknown }).status).toLowerCase());
      }
    }
  }

  const joined = statuses.join(' ');
  if (joined.includes('pending delete') || joined.includes('pendingdelete')) return 'pendingDelete';
  if (joined.includes('redemption period') || joined.includes('redemptionperiod')) return 'redemptionPeriod';

  // Domain exists and has no deletion/redemption status -> currently registered.
  return 'ok';
}
