-- ===========================================================================
-- 域名掉落监测系统 — D1 初始化迁移
-- 三张表：domains / status_history / notif_config
-- ===========================================================================

-- 被监测域名
CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  group_name TEXT NOT NULL DEFAULT '默认',
  tags TEXT DEFAULT '',
  note TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal',
  next_check_at INTEGER NOT NULL,
  last_checked_at INTEGER,
  last_notify_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_domains_next ON domains(next_check_at);
CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
CREATE INDEX IF NOT EXISTS idx_domains_group ON domains(group_name);

-- 状态变更历史
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  trigger_action TEXT NOT NULL DEFAULT 'check'
);
CREATE INDEX IF NOT EXISTS idx_hist_domain ON status_history(domain, changed_at);

-- 通知渠道配置（仅存开关/接收人/抑制间隔；凭据来自 Secrets，绝不入库）
CREATE TABLE IF NOT EXISTS notif_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT UNIQUE NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  recipient TEXT DEFAULT '',
  suppress_interval_minutes INTEGER NOT NULL DEFAULT 30,
  updated_at INTEGER NOT NULL
);

-- 种子：预置 5 个渠道，默认关闭
INSERT OR IGNORE INTO notif_config(channel, enabled, recipient, suppress_interval_minutes, updated_at)
VALUES
  ('email', 0, '', 30, 0),
  ('telegram', 0, '', 30, 0),
  ('pushplus', 0, '', 30, 0),
  ('webhook', 0, '', 30, 0),
  ('wecom', 0, '', 30, 0);
