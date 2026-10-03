import { Hono } from 'hono';
import type { Env } from '../env';
import type { EppStatus } from '../types';
import { getHistory } from '../lib/db';
import { isValidStatus } from '../lib/status';
import { json, ok } from '../lib/response';

const history = new Hono<{ Bindings: Env }>();

/** GET /api/history — filtered/paginated list, or CSV export when export=csv. */
history.get('/', async (c) => {
  const domain = c.req.query('domain') ?? undefined;
  const statusParam = c.req.query('status');
  const status = statusParam && isValidStatus(statusParam) ? (statusParam as EppStatus) : undefined;
  const from = c.req.query('from') ? Number(c.req.query('from')) : undefined;
  const to = c.req.query('to') ? Number(c.req.query('to')) : undefined;
  const page = Number(c.req.query('page') ?? '1') || 1;
  const size = Number(c.req.query('size') ?? '50') || 50;
  const exportCsv = c.req.query('export') === 'csv';

  const result = await getHistory(c.env.DB, { domain, status, from, to, page, size });

  if (exportCsv) {
    const csv = toCsv(result.items);
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="history.csv"',
      },
    });
  }

  return json(ok(result));
});

interface CsvRow {
  changed_at: number;
  domain: string;
  old_status: string | null;
  new_status: string;
  trigger_action: string;
}

function toCsv(items: CsvRow[]): string {
  const header = ['time', 'domain', 'old_status', 'new_status', 'trigger_action'];
  const lines = [header.join(',')];
  for (const it of items) {
    const cells = [
      new Date(it.changed_at).toISOString(),
      it.domain,
      it.old_status ?? '',
      it.new_status,
      it.trigger_action,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    lines.push(cells.join(','));
  }
  // Prepend UTF-8 BOM so Excel reads Chinese correctly.
  return '﻿' + lines.join('\n');
}

export default history;
