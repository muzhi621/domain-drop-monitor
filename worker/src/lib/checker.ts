import type { CheckResult, EppStatus } from '../types';
import type { Env } from '../env';
import { RdapClient } from './rdap';
import { WhoisApiClient } from './whoisApi';

/**
 * Domain detection abstraction + TLD routing (core extension point).
 *
 *  - gTLD (.com/.net/.io/.org ...) -> RDAP (IANA bootstrap resolves registry EP)
 *  - .cn (and CNNIC-managed ccTLDs) -> RDAP first (rdap.cn), fallback to the
 *    paid WHOIS/availability API when RDAP is unreachable / fails.
 */

/** Normalize a user-supplied domain: lowercase, trim, strip scheme/path. */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\s+/g, '');
}

/** Best-effort TLD extraction (handles common 2-level ccTLDs). */
export function getTld(domain: string): string {
  const parts = domain.split('.');
  if (parts.length < 2) return domain;
  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];
  // Known multi-level public suffixes we treat as a single TLD.
  const twoLevel = ['uk', 'nz', 'jp', 'au', 'br', 'cn', 'kr', 'za', 'il', 'hk', 'tw', 'sg', 'in', 'ie', 'fr', 'us'];
  if (twoLevel.includes(last) && parts.length >= 3) {
    return `${secondLast}.${last}`;
  }
  return last;
}

/** Loose validation of a domain name. */
export function isValidDomain(domain: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain);
}

/**
 * Run an availability check, routing by TLD to the appropriate data source.
 */
export async function checkAvailability(domain: string, env: Env): Promise<CheckResult> {
  const normalized = normalizeDomain(domain);
  const tld = getTld(normalized);
  const checkedAt = Date.now();

  const rdap = new RdapClient();
  try {
    const res = await rdap.lookup(normalized);
    if (res.status !== 'unknown') {
      return { domain: normalized, status: res.status, source: 'rdap', raw: res.raw, checkedAt };
    }
  } catch {
    // fall through to fallback
  }

  // .cn (and CNNIC-managed) fallback to paid WHOIS/availability API.
  if (tld === 'cn') {
    const whois = new WhoisApiClient(env);
    try {
      const res = await whois.lookup(normalized);
      return { domain: normalized, status: res.status, source: 'whois-api', raw: res.raw, checkedAt };
    } catch {
      return { domain: normalized, status: 'unknown', source: 'whois-api', checkedAt };
    }
  }

  return { domain: normalized, status: 'unknown', source: 'rdap', checkedAt };
}

/** Re-export for convenience. */
export type { EppStatus };
