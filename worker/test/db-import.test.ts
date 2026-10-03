import { describe, it, expect } from 'vitest';
import { importDomains } from '../src/lib/db';

/**
 * importDomains uses a SELECT-then-INSERT-skip pattern (rather than a literal
 * INSERT OR IGNORE). We exercise it against a fake D1 that records domain
 * inserts and treats rows already in `existing` as duplicates.
 */
function makeFakeDb(existing: Set<string>) {
  const domInserts: string[] = [];
  const db: any = {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => ({
        first: async () => {
          if (sql.includes('SELECT 1 FROM domains WHERE domain')) {
            return existing.has(args[0]) ? { '1': 1 } : null;
          }
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => {
          if (sql.startsWith('INSERT INTO domains')) {
            existing.add(args[0]);
            domInserts.push(args[0]);
          }
          return { changes: 1 };
        },
      }),
    }),
  };
  return { db, domInserts };
}

describe('db: importDomains idempotency (skip-on-duplicate)', () => {
  it('inserts new domains and skips existing ones', async () => {
    const existing = new Set<string>();
    const { db, domInserts } = makeFakeDb(existing);
    const r1 = await importDomains(db, [{ domain: 'a.com' }, { domain: 'b.com' }, { domain: 'c.com' }]);
    expect(r1.imported).toBe(3);
    expect(r1.skipped).toBe(0);
    expect(domInserts).toEqual(['a.com', 'b.com', 'c.com']);

    const r2 = await importDomains(db, [{ domain: 'a.com' }, { domain: 'd.com' }]);
    expect(r2.imported).toBe(1);
    expect(r2.skipped).toBe(1);
    expect(domInserts).toEqual(['a.com', 'b.com', 'c.com', 'd.com']);
  });

  it('skips an already-present domain without inserting', async () => {
    const existing = new Set<string>(['a.com']);
    const { db, domInserts } = makeFakeDb(existing);
    const r = await importDomains(db, [{ domain: 'a.com' }]);
    expect(r.skipped).toBe(1);
    expect(r.imported).toBe(0);
    expect(domInserts).toEqual([]);
  });

  it('skips empty/blank rows', async () => {
    const existing = new Set<string>();
    const { db } = makeFakeDb(existing);
    const r = await importDomains(db, [{ domain: '' }]);
    expect(r.imported).toBe(0);
    expect(r.skipped).toBe(0);
  });
});
