import { Hono } from 'hono';
import type { Env } from '../env';
import type { EppStatus, Priority } from '../types';
import {
  ConflictError,
  createDomain,
  deleteDomain,
  getDomain,
  importDomains,
  listDomains,
  updateDomain,
  updateDomainStatus,
  updateLastChecked,
  insertHistory,
} from '../lib/db';
import { checkAvailability, isValidDomain, normalizeDomain } from '../lib/checker';
import { isValidPriority, isValidStatus } from '../lib/status';
import { fail, json, ok } from '../lib/response';

const domains = new Hono<{ Bindings: Env }>();

/** GET /api/domains — list with optional q/group/status/page/size. */
domains.get('/', async (c) => {
  const q = c.req.query('q') ?? undefined;
  const group = c.req.query('group') ?? undefined;
  const statusParam = c.req.query('status');
  const status = statusParam && isValidStatus(statusParam) ? (statusParam as EppStatus) : undefined;
  const page = Number(c.req.query('page') ?? '1') || 1;
  const size = Number(c.req.query('size') ?? '20') || 20;

  const result = await listDomains(c.env.DB, { q, group, status, page, size });
  return json(ok(result));
});

/** POST /api/domains — create a single domain. */
domains.post('/', async (c) => {
  const body = await c.req
    .json<{ domain?: string; group?: string; tags?: string; note?: string; priority?: string }>()
    .catch(() => ({}) as { domain?: string; group?: string; tags?: string; note?: string; priority?: string });
  const rawDomain = (body.domain ?? '').toString().trim();
  const domain = normalizeDomain(rawDomain);
  if (!isValidDomain(domain)) {
    return json(fail(422, '域名格式不合法'), 422);
  }
  const priority: Priority | undefined = body.priority && isValidPriority(body.priority) ? (body.priority as Priority) : undefined;

  try {
    const created = await createDomain(c.env.DB, {
      domain,
      group_name: body.group,
      tags: body.tags,
      note: body.note,
      priority,
    });
    return json(ok(created));
  } catch (e) {
    if (e instanceof ConflictError) return json(fail(409, e.message), 409);
    return json(fail(500, (e as Error).message), 500);
  }
});

/** GET /api/domains/:id — get one. */
domains.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await getDomain(c.env.DB, id);
  if (!row) return json(fail(404, '域名不存在'), 404);
  return json(ok(row));
});

/** PUT /api/domains/:id — update group/tags/note/priority. */
domains.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req
    .json<{ group?: string; tags?: string; note?: string; priority?: string }>()
    .catch(() => ({}) as { group?: string; tags?: string; note?: string; priority?: string });
  const priority: Priority | undefined = body.priority && isValidPriority(body.priority) ? (body.priority as Priority) : undefined;

  const updated = await updateDomain(c.env.DB, id, {
    group_name: body.group,
    tags: body.tags,
    note: body.note,
    priority,
  });
  if (!updated) return json(fail(404, '域名不存在'), 404);
  return json(ok(updated));
});

/** DELETE /api/domains/:id — delete. */
domains.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const okDel = await deleteDomain(c.env.DB, id);
  if (!okDel) return json(fail(404, '域名不存在'), 404);
  return json(ok(null));
});

/** POST /api/domains/import — idempotent bulk import (CSV / text). */
domains.post('/import', async (c) => {
  const body = await c.req.json<{ text?: string }>().catch(() => ({}) as { text?: string });
  const text = body.text ?? '';
  const rows = parseImportText(text);
  if (rows.length === 0) {
    return json(fail(422, '未解析到任何有效域名'), 422);
  }
  const result = await importDomains(c.env.DB, rows);
  return json(ok(result));
});

/** POST /api/domains/:id/check — force an immediate availability check. */
domains.post('/:id/check', async (c) => {
  const id = Number(c.req.param('id'));
  const domain = await getDomain(c.env.DB, id);
  if (!domain) return json(fail(404, '域名不存在'), 404);

  const result = await checkAvailability(domain.domain, c.env);
  const now = result.checkedAt;

  if (result.status !== domain.status) {
    await insertHistory(c.env.DB, {
      domain: domain.domain,
      old_status: domain.status,
      new_status: result.status,
      changed_at: now,
      trigger_action: 'manual',
    });
    await updateDomainStatus(c.env.DB, id, result.status, now);
  } else {
    await updateLastChecked(c.env.DB, id, now);
  }
  return json(ok(result));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse import text into rows. Expected columns: domain,group,tags,note
 * (comma-separated; header row auto-skipped; bare domain lines allowed).
 */
function parseImportText(text: string): { domain: string; group_name?: string; tags?: string; note?: string }[] {
  const rows: { domain: string; group_name?: string; tags?: string; note?: string }[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const cells = trimmed.split(',').map((s) => s.trim());
    const first = cells[0];

    // Skip an obvious header row.
    if (first.toLowerCase() === 'domain') continue;

    const domain = normalizeDomain(first);
    if (!isValidDomain(domain)) continue;

    if (cells.length >= 2) {
      rows.push({
        domain,
        group_name: cells[1] || undefined,
        tags: cells[2] || undefined,
        note: cells.slice(3).join(',') || undefined,
      });
    } else {
      rows.push({ domain });
    }
  }
  return rows;
}

export default domains;
