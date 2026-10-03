import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import domainsApp from '../src/routes/domains';
import type { Env } from '../src/env';

const importDomainsMock = vi.fn();

vi.mock('../src/lib/db', () => ({
  createDomain: vi.fn(),
  deleteDomain: vi.fn(),
  getDomain: vi.fn(),
  importDomains: (...args: any[]) => importDomainsMock(...args),
  listDomains: vi.fn(),
  updateDomain: vi.fn(),
  updateDomainStatus: vi.fn(),
  updateLastChecked: vi.fn(),
  insertHistory: vi.fn(),
  ConflictError: class extends Error {},
}));

const env = {} as unknown as Env;

describe('routes/domains: POST /import — CSV/text parsing (idempotency entry)', () => {
  beforeEach(() => {
    importDomainsMock.mockReset();
    importDomainsMock.mockResolvedValue({ imported: 0, skipped: 0, errors: [] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function postImport(text: string) {
    return domainsApp.request(
      '/import',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      },
      env,
    );
  }

  it('parses lines into rows (lowercased domain, group/tags/note), skips header & invalid', async () => {
    const text = [
      'domain,group,tags,note',
      ' Example.COM , 抢注 , #短, 重要域名 ',
      'test.io, 观察, #品牌',
      'bad domain,grp', // invalid domain -> skipped
      'BARE.io',        // bare domain line
    ].join('\n');
    const res = await postImport(text);
    expect(res.status).toBe(200);
    const rows = importDomainsMock.mock.calls[0][1];
    expect(rows).toEqual([
      { domain: 'example.com', group_name: '抢注', tags: '#短', note: '重要域名' },
      { domain: 'test.io', group_name: '观察', tags: '#品牌', note: undefined },
      { domain: 'bare.io' },
    ]);
  });

  it('returns 422 when no valid domain is parsed', async () => {
    const res = await postImport('domain,group\nnot a domain\n???');
    expect(res.status).toBe(422);
    expect(importDomainsMock).not.toHaveBeenCalled();
  });

  it('joins the note column from the 4th field onward (cells are individually trimmed)', async () => {
    // Each comma-separated cell is trimmed, so "note, with, commas" -> "note,with,commas"
    const res = await postImport('a.com,g,tag,note, with, commas');
    expect(res.status).toBe(200);
    const rows = importDomainsMock.mock.calls[0][1];
    expect(rows[0].note).toBe('note,with,commas');
  });
});
