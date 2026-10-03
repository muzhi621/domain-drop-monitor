import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { normalizeDomain, getTld, isValidDomain, checkAvailability } from '../src/lib/checker';
import type { Env } from '../src/env';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as any,
    ADMIN_PASSWORD: 'x',
    SESSION_SECRET: 'secret',
    RESEND_API_KEY: '',
    TG_BOT_TOKEN: '',
    TG_CHAT_ID: '',
    PUSHPLUS_TOKEN: '',
    NOTIF_WEBHOOK_URL: '',
    WECOM_WEBHOOK_URL: '',
    WHOIS_API_BASE: '',
    WHOIS_API_KEY: '',
    ...overrides,
  } as Env;
}

/** Build a fetch stub driven by a URL-based handler. */
function mockFetch(handler: (url: string) => { status: number; json?: unknown; ok?: boolean; throws?: boolean }) {
  return vi.fn(async (url: any) => {
    const u = String(url);
    const r = handler(u);
    if (r.throws) throw new Error('network');
    const body = r.json !== undefined ? JSON.stringify(r.json) : '';
    return {
      ok: r.ok ?? (r.status >= 200 && r.status < 300),
      status: r.status,
      json: async () => (r.json !== undefined ? r.json : null),
      text: async () => body,
    } as unknown as Response;
  });
}

describe('checker: normalizeDomain', () => {
  it('lowercases, trims, strips scheme/path/query', () => {
    expect(normalizeDomain(' Example.COM/Path?x=1 ')).toBe('example.com');
    expect(normalizeDomain('HTTPS://Sub.Domain.IO')).toBe('sub.domain.io');
    expect(normalizeDomain('http://TEST.cn/')).toBe('test.cn');
  });
  it('removes internal whitespace', () => {
    expect(normalizeDomain('ba d domain.xyz')).toBe('baddomain.xyz');
  });
});

describe('checker: getTld', () => {
  it('extracts the simple TLD', () => {
    expect(getTld('example.com')).toBe('com');
    expect(getTld('a.b.com')).toBe('com');
    expect(getTld('a.b')).toBe('b');
  });
  it('treats known 2-level public suffixes as a single TLD', () => {
    expect(getTld('example.co.uk')).toBe('co.uk');
    expect(getTld('example.com.cn')).toBe('com.cn');
    expect(getTld('example.cn')).toBe('cn');
  });
  it('returns the whole string when there is no dot', () => {
    expect(getTld('localhost')).toBe('localhost');
  });
});

describe('checker: isValidDomain', () => {
  it('accepts valid domains', () => {
    expect(isValidDomain('example.com')).toBe(true);
    expect(isValidDomain('a.b.com')).toBe(true);
    expect(isValidDomain('test.io')).toBe(true);
    expect(isValidDomain('xn--p1ai.ru')).toBe(true);
  });
  it('rejects invalid domains', () => {
    expect(isValidDomain('bad_domain.com')).toBe(false); // underscore
    expect(isValidDomain('-bad.com')).toBe(false);        // leading hyphen
    expect(isValidDomain('example')).toBe(false);         // no dot
    expect(isValidDomain('a..com')).toBe(false);          // empty label
  });
});

describe('checker: checkAvailability — TLD routing + 5-state normalization', () => {
  const IANA = { services: [[['com', 'net', 'io'], ['https://rdap.verisign.com/']]] };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('routes a gTLD (.com) to RDAP and normalizes a 404 as available', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch((u) => {
        if (u.includes('data.iana.org/rdap/dns.json')) return { status: 200, json: IANA };
        if (u.includes('/domain/')) return { status: 404 };
        return { status: 200 };
      }) as any,
    );
    const res = await checkAvailability('Example.COM', makeEnv());
    expect(res.source).toBe('rdap');
    expect(res.status).toBe('available');
    expect(res.domain).toBe('example.com');
  });

  it('normalizes RDAP status arrays into pendingDelete / redemptionPeriod / ok', async () => {
    async function checkRdap(statusArr: string[]) {
      vi.stubGlobal(
        'fetch',
        mockFetch((u) => {
          if (u.includes('data.iana.org/rdap/dns.json')) return { status: 200, json: IANA };
          if (u.includes('/domain/')) return { status: 200, json: { status: statusArr } };
          return { status: 200 };
        }) as any,
      );
      return (await checkAvailability('a.com', makeEnv())).status;
    }
    expect(await checkRdap(['pending delete'])).toBe('pendingDelete');
    expect(await checkRdap(['redemption period'])).toBe('redemptionPeriod');
    expect(await checkRdap([])).toBe('ok');
  });

  it('returns unknown (rdap) when the IANA bootstrap fails', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch((u) => {
        if (u.includes('data.iana.org/rdap/dns.json')) return { status: 500 };
        return { status: 200 };
      }) as any,
    );
    const res = await checkAvailability('a.com', makeEnv());
    expect(res.status).toBe('unknown');
    expect(res.source).toBe('rdap');
  });

  it('routes .cn to RDAP first, then falls back to the WHOIS API', async () => {
    const env = makeEnv({ WHOIS_API_BASE: 'https://whois.test/api', WHOIS_API_KEY: 'k' });
    vi.stubGlobal(
      'fetch',
      mockFetch((u) => {
        if (u.includes('rdap.cn')) return { throws: true }; // force fallback
        if (u.includes('whois.test')) return { status: 200, json: { available: true } };
        return { status: 200 };
      }) as any,
    );
    const res = await checkAvailability('test.cn', env);
    expect(res.source).toBe('whois-api');
    expect(res.status).toBe('available');
  });

  it('normalizes WHOIS responses into all 6 EPP statuses', async () => {
    const env = makeEnv({ WHOIS_API_BASE: 'https://whois.test/api', WHOIS_API_KEY: 'k' });
    async function checkWhois(json: unknown) {
      vi.stubGlobal(
        'fetch',
        mockFetch((u) => {
          if (u.includes('rdap.cn')) return { throws: true };
          if (u.includes('whois.test')) return { status: 200, json };
          return { status: 200 };
        }) as any,
      );
      return (await checkAvailability('test.cn', env)).status;
    }
    expect(await checkWhois({ available: true })).toBe('available');
    expect(await checkWhois({ status: 'redemption period' })).toBe('redemptionPeriod');
    expect(await checkWhois({ status: 'pending delete' })).toBe('pendingDelete');
    expect(await checkWhois({ expired: true })).toBe('expired');
    expect(await checkWhois({ status: 'registered' })).toBe('ok');
    expect(await checkWhois(null)).toBe('unknown');
  });

  it('.cn without WHOIS credentials yields unknown via the whois-api path', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch((u) => {
        if (u.includes('rdap.cn')) return { throws: true };
        return { status: 200 };
      }) as any,
    );
    const res = await checkAvailability('test.cn', makeEnv());
    expect(res.status).toBe('unknown');
    expect(res.source).toBe('whois-api');
  });

  it('.cn where RDAP directly returns 404 uses the rdap path (no fallback)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch((u) => {
        if (u.includes('rdap.cn')) return { status: 404 };
        return { status: 200 };
      }) as any,
    );
    const res = await checkAvailability('test.cn', makeEnv({ WHOIS_API_BASE: 'https://whois.test/api', WHOIS_API_KEY: 'k' }));
    expect(res.source).toBe('rdap');
    expect(res.status).toBe('available');
  });
});
