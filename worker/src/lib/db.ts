import type { Channel, Domain, EppStatus, NotifConfig, Priority, StatusHistory } from '../types';
import { normalizeStatus } from './status';

/**
 * D1 (SQLite) data-access layer. All queries are parameterized to prevent
 * SQL injection. Row objects are returned with column names matching the
 * TypeScript interfaces, so a simple cast is sufficient.
 */

type Row = Record<string, unknown>;

function mapDomain(r: Row): Domain {
  return {
    id: Number(r.id),
    domain: String(r.domain),
    status: normalizeStatus(String(r.status)),
    group_name: String(r.group_name ?? '默认'),
    tags: String(r.tags ?? ''),
    note: String(r.note ?? ''),
    priority: (['high', 'normal', 'low'].includes(String(r.priority)) ? String(r.priority) : 'normal') as Priority,
    next_check_at: Number(r.next_check_at),
    last_checked_at: r.last_checked_at == null ? null : Number(r.last_checked_at),
    last_notify_at: r.last_notify_at == null ? null : Number(r.last_notify_at),
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
  };
}

function mapHistory(r: Row): StatusHistory {
  return {
    id: Number(r.id),
    domain: String(r.domain),
    old_status: r.old_status == null ? null : normalizeStatus(String(r.old_status)),
    new_status: normalizeStatus(String(r.new_status)),
    changed_at: Number(r.changed_at),
    trigger_action: String(r.trigger_action),
  };
}

function mapNotif(r: Row): NotifConfig {
  return {
    id: Number(r.id),
    channel: String(r.channel) as Channel,
    enabled: Number(r.enabled) === 1,
    recipient: String(r.recipient ?? ''),
    suppress_interval_minutes: Number(r.suppress_interval_minutes),
    updated_at: Number(r.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export interface ListFilter {
  q?: string;
  group?: string;
  status?: EppStatus;
  page?: number;
  size?: number;
}

export async function getDueDomains(db: D1Database, now: number, limit: number): Promise<Domain[]> {
  const { results } = await db
    .prepare('SELECT * FROM domains WHERE next_check_at <= ? ORDER BY next_check_at ASC LIMIT ?')
    .bind(now, limit)
    .all<Row>();
  return (results ?? []).map(mapDomain);
}

export async function listDomains(
  db: D1Database,
  filter: ListFilter,
): Promise<{ items: Domain[]; total: number }> {
  const page = Math.max(1, filter.page ?? 1);
  const size = Math.min(200, Math.max(1, filter.size ?? 20));
  const offset = (page - 1) * size;

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.q) {
    where.push('domain LIKE ?');
    params.push(`%${filter.q}%`);
  }
  if (filter.group) {
    where.push('group_name = ?');
    params.push(filter.group);
  }
  if (filter.status) {
    where.push('status = ?');
    params.push(filter.status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRes = await db
    .prepare(`SELECT COUNT(*) AS c FROM domains ${whereSql}`)
    .bind(...params)
    .first<{ c: number }>();
  const total = countRes ? Number(countRes.c) : 0;

  const { results } = await db
    .prepare(`SELECT * FROM domains ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .bind(...params, size, offset)
    .all<Row>();
  return { items: (results ?? []).map(mapDomain), total };
}

export interface CreateDomainInput {
  domain: string;
  group_name?: string;
  tags?: string;
  note?: string;
  priority?: Priority;
}

export class ConflictError extends Error {
  constructor(message = '域名已存在') {
    super(message);
    this.name = 'ConflictError';
  }
}

export async function createDomain(db: D1Database, input: CreateDomainInput): Promise<Domain> {
  const now = Date.now();
  const domain = input.domain;
  const group_name = input.group_name?.trim() || '默认';
  const tags = input.tags ?? '';
  const note = input.note ?? '';
  const priority: Priority = ['high', 'normal', 'low'].includes(input.priority ?? '')
    ? (input.priority as Priority)
    : 'normal';

  const existing = await db.prepare('SELECT 1 FROM domains WHERE domain = ?').bind(domain).first();
  if (existing) throw new ConflictError();

  await db
    .prepare(
      `INSERT INTO domains (domain, status, group_name, tags, note, priority, next_check_at, created_at, updated_at)
       VALUES (?, 'unknown', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(domain, group_name, tags, note, priority, now, now, now)
    .run();

  const row = await db.prepare('SELECT * FROM domains WHERE domain = ?').bind(domain).first<Row>();
  return mapDomain(row as Row);
}

export async function getDomain(db: D1Database, id: number): Promise<Domain | null> {
  const row = await db.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first<Row>();
  return row ? mapDomain(row) : null;
}

export interface UpdateDomainInput {
  group_name?: string;
  tags?: string;
  note?: string;
  priority?: Priority;
}

export async function updateDomain(db: D1Database, id: number, patch: UpdateDomainInput): Promise<Domain | null> {
  const current = await getDomain(db, id);
  if (!current) return null;

  const group_name = patch.group_name?.trim() || current.group_name;
  const tags = patch.tags ?? current.tags;
  const note = patch.note ?? current.note;
  const priority = patch.priority ?? current.priority;
  const updated_at = Date.now();

  await db
    .prepare(
      `UPDATE domains SET group_name = ?, tags = ?, note = ?, priority = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(group_name, tags, note, priority, updated_at, id)
    .run();

  return getDomain(db, id);
}

export async function deleteDomain(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare('DELETE FROM domains WHERE id = ?').bind(id).run();
  return (((res as unknown as { changes?: number }).changes) ?? 0) > 0;
}

export interface ImportRow {
  domain: string;
  group_name?: string;
  tags?: string;
  note?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export async function importDomains(db: D1Database, rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
  const now = Date.now();

  for (const row of rows) {
    const domain = row.domain;
    if (!domain) continue;
    try {
      const existing = await db.prepare('SELECT 1 FROM domains WHERE domain = ?').bind(domain).first();
      if (existing) {
        result.skipped += 1;
        continue;
      }
      await db
        .prepare(
          `INSERT INTO domains (domain, status, group_name, tags, note, priority, next_check_at, created_at, updated_at)
           VALUES (?, 'unknown', ?, ?, ?, 'normal', ?, ?, ?)`,
        )
        .bind(
          domain,
          row.group_name?.trim() || '默认',
          row.tags ?? '',
          row.note ?? '',
          now,
          now,
          now,
        )
        .run();
      await insertHistory(db, {
        domain,
        old_status: null,
        new_status: 'unknown',
        changed_at: now,
        trigger_action: 'import',
      });
      result.imported += 1;
    } catch (e) {
      result.errors.push(`${domain}: ${(e as Error).message}`);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Status updates (used by scheduler & force-check)
// ---------------------------------------------------------------------------

export async function updateDomainStatus(db: D1Database, id: number, status: EppStatus, checkedAt: number): Promise<void> {
  await db
    .prepare('UPDATE domains SET status = ?, updated_at = ?, last_checked_at = ? WHERE id = ?')
    .bind(status, checkedAt, checkedAt, id)
    .run();
}

export async function updateLastChecked(db: D1Database, id: number, checkedAt: number): Promise<void> {
  await db.prepare('UPDATE domains SET last_checked_at = ?, updated_at = ? WHERE id = ?').bind(checkedAt, checkedAt, id).run();
}

export async function setNextCheck(
  db: D1Database,
  id: number,
  nextCheckAt: number,
  lastCheckedAt?: number,
): Promise<void> {
  if (lastCheckedAt != null) {
    await db
      .prepare('UPDATE domains SET next_check_at = ?, last_checked_at = ?, updated_at = ? WHERE id = ?')
      .bind(nextCheckAt, lastCheckedAt, lastCheckedAt, id)
      .run();
  } else {
    await db.prepare('UPDATE domains SET next_check_at = ? WHERE id = ?').bind(nextCheckAt, id).run();
  }
}

export async function updateLastNotify(db: D1Database, id: number, now: number): Promise<void> {
  await db.prepare('UPDATE domains SET last_notify_at = ? WHERE id = ?').bind(now, id).run();
}

// ---------------------------------------------------------------------------
// Status history
// ---------------------------------------------------------------------------

export interface HistoryInput {
  domain: string;
  old_status: EppStatus | null;
  new_status: EppStatus;
  changed_at: number;
  trigger_action: string;
}

export async function insertHistory(db: D1Database, input: HistoryInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO status_history (domain, old_status, new_status, changed_at, trigger_action)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(input.domain, input.old_status, input.new_status, input.changed_at, input.trigger_action)
    .run();
}

export interface HistoryFilter {
  domain?: string;
  status?: EppStatus;
  from?: number;
  to?: number;
  page?: number;
  size?: number;
}

export async function getHistory(
  db: D1Database,
  filter: HistoryFilter,
): Promise<{ items: StatusHistory[]; total: number }> {
  const page = Math.max(1, filter.page ?? 1);
  const size = Math.min(500, Math.max(1, filter.size ?? 50));
  const offset = (page - 1) * size;

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.domain) {
    where.push('domain LIKE ?');
    params.push(`%${filter.domain}%`);
  }
  if (filter.status) {
    where.push('new_status = ?');
    params.push(filter.status);
  }
  if (filter.from != null) {
    where.push('changed_at >= ?');
    params.push(filter.from);
  }
  if (filter.to != null) {
    where.push('changed_at <= ?');
    params.push(filter.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRes = await db
    .prepare(`SELECT COUNT(*) AS c FROM status_history ${whereSql}`)
    .bind(...params)
    .first<{ c: number }>();
  const total = countRes ? Number(countRes.c) : 0;

  const { results } = await db
    .prepare(`SELECT * FROM status_history ${whereSql} ORDER BY changed_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, size, offset)
    .all<Row>();
  return { items: (results ?? []).map(mapHistory), total };
}

export async function hasWarned(db: D1Database, domain: string, status: EppStatus): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM status_history WHERE domain = ? AND trigger_action = 'warn-notify' AND new_status = ? LIMIT 1`,
    )
    .bind(domain, status)
    .first();
  return !!row;
}

export async function pruneHistory(db: D1Database, keepDays: number): Promise<void> {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  await db.prepare('DELETE FROM status_history WHERE changed_at < ?').bind(cutoff).run();
}

// ---------------------------------------------------------------------------
// Notif config
// ---------------------------------------------------------------------------

export async function getNotifConfigs(db: D1Database): Promise<NotifConfig[]> {
  const { results } = await db
    .prepare('SELECT * FROM notif_config ORDER BY id ASC')
    .all<Row>();
  return (results ?? []).map(mapNotif);
}

export async function getNotifConfig(db: D1Database, channel: Channel): Promise<NotifConfig | null> {
  const row = await db.prepare('SELECT * FROM notif_config WHERE channel = ?').bind(channel).first<Row>();
  return row ? mapNotif(row) : null;
}

export interface UpdateNotifInput {
  enabled?: boolean;
  recipient?: string;
  suppress_interval_minutes?: number;
}

export async function upsertNotifConfig(db: D1Database, channel: Channel, patch: UpdateNotifInput): Promise<NotifConfig> {
  const current = await getNotifConfig(db, channel);
  if (!current) throw new Error('未知渠道');

  const enabled = patch.enabled ?? current.enabled;
  const recipient = patch.recipient ?? current.recipient;
  const suppress = patch.suppress_interval_minutes ?? current.suppress_interval_minutes;
  const updated_at = Date.now();

  await db
    .prepare(
      `UPDATE notif_config SET enabled = ?, recipient = ?, suppress_interval_minutes = ?, updated_at = ? WHERE channel = ?`,
    )
    .bind(enabled ? 1 : 0, recipient, suppress, updated_at, channel)
    .run();

  return (await getNotifConfig(db, channel)) as NotifConfig;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface Stats {
  total: number;
  byStatus: Record<EppStatus, number>;
  recentDrops: StatusHistory[];
}

export async function getStats(db: D1Database): Promise<Stats> {
  const byStatus = {
    ok: 0,
    expired: 0,
    redemptionPeriod: 0,
    pendingDelete: 0,
    available: 0,
    unknown: 0,
  } as Record<EppStatus, number>;

  const { results } = await db.prepare('SELECT status, COUNT(*) AS c FROM domains GROUP BY status').all<Row>();
  for (const r of results ?? []) {
    const s = normalizeStatus(String(r.status));
    byStatus[s] = Number(r.c);
  }

  const totalRes = await db.prepare('SELECT COUNT(*) AS c FROM domains').first<{ c: number }>();
  const total = totalRes ? Number(totalRes.c) : 0;

  const recent = await db
    .prepare(
      `SELECT * FROM status_history WHERE new_status = 'available' ORDER BY changed_at DESC LIMIT 20`,
    )
    .all<Row>();
  const recentDrops = (recent.results ?? []).map(mapHistory);

  return { total, byStatus, recentDrops };
}
