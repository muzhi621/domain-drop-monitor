# 域名掉落监测与可注册性通知系统（domain-drop-monitor）

零运维、部署在 Cloudflare 边缘的域名 drop 监测器。用 **Workers + D1 + Cron Triggers + Hono** 实现后端，**Vite + React + Tailwind** 实现前端（Cloudflare Pages 托管），域名可用性优先直接用 **RDAP**（免费）检测，drop 时通过 **邮件 / PushPlus / Telegram / Webhook / 企业微信** 多通道告警。

---

## 1. 架构概览

```
浏览器 ──HTTPS──► Pages SPA(React) ──同站/API──► Worker(Hono)
                                                  │
                                          ┌───────┴────────┐
                                          ▼                ▼
                                       D1(sqlite)      Cron(1/min)
                                                        │
                                              ┌─────────┴──────────┐
                                              ▼                    ▼
                                         RDAP/WHOIS         通知分发(5渠道)
```

- 单一 Worker 同时暴露 `fetch`（REST API + 鉴权）与 `scheduled`（Cron 批量检测）。
- 单管理员口令登录，HMAC-SHA256 签名 Cookie（`dm_session`），无 D1 会话表。
- 密钥全部来自 Cloudflare Secrets，**绝不入代码库 / 不入 D1 明文**。

---

## 2. 目录结构

```
doname/
├── wrangler.toml                 # Worker 配置（main、D1 绑定 DB、Cron、Secrets 声明）
├── package.json                  # 根脚本（install:all / dev / deploy 组合）
├── .dev.vars                     # 本地开发 Secrets（仅示例，已 gitignore）
├── worker/                       # 后端（Hono + D1）
│   ├── src/index.ts              # Worker 入口 fetch + scheduled
│   ├── src/app.ts                # Hono 装配
│   ├── src/env.ts / types.ts / lib/response.ts
│   ├── src/lib/{auth,db,status,checker,rdap,whoisApi,scheduler,notifier}.ts
│   ├── src/lib/channels/*        # 5 个通知渠道
│   ├── src/middleware/auth.ts
│   ├── src/routes/{auth,domains,history,notifications,stats}.ts
│   └── migrations/0001_init.sql  # 三表 + 索引 + notif_config 种子
└── frontend/                     # 前端 SPA（Vite + React + Tailwind）
    └── src/{main,App}.tsx, api/client.ts, auth/useAuth.ts, components/*
```

---

## 3. 本地开发

### 3.1 后端（Worker）

```bash
# 1) 安装依赖
cd worker && npm install

# 2) 配置本地 Secrets（仅示例值，生产请用真实强口令）
cp ../.dev.vars .dev.vars   # 已忽略真实值，仅占位

# 3) 创建并迁移本地 D1
npx wrangler d1 create domain_monitor
#   将输出的 database_id 填到根 wrangler.toml 的 d1_databases.database_id
npx wrangler d1 migrations apply domain_monitor --local

# 4) 启动本地 Worker（默认 http://localhost:8787）
npm run dev
```

健康检查：`curl http://localhost:8787/health` → `ok`。

### 3.2 前端

```bash
cd frontend && npm install
npm run dev        # 默认 http://localhost:5173，/api 已代理到 localhost:8787
```

前端通过 Vite 代理访问本地 Worker；生产环境由 Cloudflare Pages 与 Worker 同站部署（或自定义域），Cookie `SameSite=Lax` 随同站请求自动携带。

---

## 4. 部署到 Cloudflare（Cloudflare 原生 Git 集成：CF 拉取 GitHub 自动部署）

本系统采用 **Cloudflare 原生 Git 集成**部署：你把本 GitHub 仓库连接到 Cloudflare（Worker 与 Pages），之后 **每次 `git push` 到 `main`，Cloudflare 自动拉取并部署**。本仓库**不内置 GitHub Actions**，也**无需**在 GitHub 配置 `CF_API_TOKEN` / `CF_ACCOUNT_ID`。

> 前置：本地建议安装 `wrangler`（`npm install -g wrangler` 并 `wrangler login`），用于创建 D1 与执行迁移。不装也能用 Cloudflare Dashboard 完成等效操作。

### 4.1 一次性准备：创建并绑定 D1（必须）

Cloudflare 原生部署直接执行 `wrangler deploy`，**不会自动创建 D1，也不会回填 `database_id`**，所以必须先在 `wrangler.toml` 填好 id：

1. 创建 D1 数据库（二选一）：
   - 命令行：`wrangler d1 create domain_monitor` → 复制输出的 **database_id**；
   - 或 Dashboard：Storage & Databases → D1 → Create database → 名称 `domain_monitor` → 复制 ID。
2. 把 id 填回根 `wrangler.toml` 第 12 行的 `database_id`（替换 `REPLACE_WITH_YOUR_D1_DATABASE_ID`）。
3. 提交并推送：`git add wrangler.toml && git commit -m "chore: set D1 database_id" && git push`。

### 4.2 在 Cloudflare 绑定 GitHub 仓库（连接 Git，push 即部署）

- **后端 Worker**：Dashboard → Workers & Pages → 创建（或导入）→ 选择「连接 Git 仓库」→ 选本仓库 `domain-drop-monitor`。CF 在每次 push 自动执行 `wrangler deploy`（读取仓库根 `wrangler.toml`）。
- **前端 Pages**：Dashboard → Workers & Pages → Pages → 连接 Git 仓库 → 框架预设 **Vite**，根目录 `frontend`，构建命令 `npm run build`，输出目录 `dist`。保存后每次 push 自动重新构建部署。

> 推荐 Worker + Pages 都接同一仓库；若只部署其一也能单独运行。

### 4.3 建表（仅首次，部署后做一次）

CF 部署**不会**自动跑迁移，需手动建表（二选一）：

- 命令行：`wrangler d1 migrations apply domain_monitor --remote`
- 或 Dashboard → D1 → `domain_monitor` → Console → 粘贴 `worker/migrations/0001_init.sql` 内容执行

### 4.4 登录密码（变量 `ADMIN_PASSWORD`，可设初始密码 / 忘记后重置）★

- 后台登录口令完全由 Cloudflare **变量 `ADMIN_PASSWORD`** 控制，代码中不做硬编码。
- **设置初始密码**：Cloudflare Dashboard → 你的 Worker → Settings → Variables → 添加变量 `ADMIN_PASSWORD`（类型选 **Secret**），或命令 `wrangler secret put ADMIN_PASSWORD`。
- **忘记密码 → 重置**：重新设置 `ADMIN_PASSWORD`（Dashboard 编辑该变量，或 `wrangler secret put ADMIN_PASSWORD`）。改完**下次登录即用新密码**，无需改代码、无需重新部署。
- **强制全部下线**：轮换 `SESSION_SECRET` 即让所有已登录会话立即失效。单独改 `ADMIN_PASSWORD` 不会让已签发 Cookie 失效（旧会话 7 天内仍有效），如需立即作废可同时轮换 `SESSION_SECRET`。
- 两个变量均建议设为 **Secret** 并使用强随机值。

### 4.5 设置运行密钥（Cloudflare Secrets / 变量，按需）

除 `ADMIN_PASSWORD` / `SESSION_SECRET` 外，各通知渠道凭据也是 Cloudflare Secret，未配置则对应渠道发送时自动跳过。在 Cloudflare Dashboard → Worker → Settings → Variables 添加（类型选 Secret），或本地执行：

```bash
cd worker
wrangler secret put ADMIN_PASSWORD
wrangler secret put SESSION_SECRET
wrangler secret put RESEND_API_KEY        # 邮件（Resend）
wrangler secret put TG_BOT_TOKEN          # Telegram Bot Token
wrangler secret put TG_CHAT_ID            # Telegram 接收 Chat ID
wrangler secret put PUSHPLUS_TOKEN        # PushPlus 微信 Token
wrangler secret put NOTIF_WEBHOOK_URL     # 通用 Webhook URL
wrangler secret put WECOM_WEBHOOK_URL     # 企业微信机器人 Webhook URL
wrangler secret put WHOIS_API_BASE        # .cn 回退付费 WHOIS/可用性 API 基址
wrangler secret put WHOIS_API_KEY         # 付费 WHOIS API Key
```

### 4.6 自定义域（推荐，避免跨域 Cookie 问题）

将 Worker 与 Pages 绑定到**同一 zone / 自定义域**（如 `monitor.example.com`），确保前端与 API 同站，`dm_session` Cookie 可正常携带。若二者不同域，前端需配置 `VITE_API_BASE=https://<worker-subdomain>.workers.dev` 后重新构建部署。

---

## 5. Cloudflare 变量 / Secrets 设置清单（共 10 个）

在 Cloudflare Dashboard → Worker → Settings → Variables 添加（建议类型 Secret），或通过 `wrangler secret put` 注入：

| 变量 | 说明 | 必填 |
|---|---|---|
| `ADMIN_PASSWORD` | 单管理员登录口令（强口令） | ✅ |
| `SESSION_SECRET` | HMAC 签名 Cookie 密钥（>=32 字节随机） | ✅ |
| `RESEND_API_KEY` | 邮件（Resend） | 用邮件则填 |
| `TG_BOT_TOKEN` | Telegram Bot Token | 用 TG 则填 |
| `TG_CHAT_ID` | Telegram 接收 Chat ID | 用 TG 则填 |
| `PUSHPLUS_TOKEN` | PushPlus 微信 Token | 用 PushPlus 则填 |
| `NOTIF_WEBHOOK_URL` | 通用 Webhook URL | 用 Webhook 则填 |
| `WECOM_WEBHOOK_URL` | 企业微信机器人 Webhook URL | 用企微则填 |
| `WHOIS_API_BASE` | .cn 回退付费 WHOIS/可用性 API 基址 | 仅 .cn 需要 |
| `WHOIS_API_KEY` | 付费 WHOIS API Key | 仅 .cn 需要 |

> 未配置某渠道凭据，该渠道发送时自动跳过，不影响其他渠道与系统运行。
> 本仓库采用 Cloudflare 原生 Git 集成，**无需**在 GitHub 配置任何 Secret（无内置 workflow）。

---

## 6. REST API 速览

所有响应统一为 `{ code, data, message }`（成功 `code:0`）。错误码：`400/401/404/409/422/429/500`。

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/api/auth/login` | 登录（body `{password}`） | 公开 |
| POST | `/api/auth/logout` | 登出 | 需登录 |
| GET | `/api/auth/me` | 会话校验 | 公开 |
| GET | `/api/domains` | 列表（?q=&group=&status=&page=&size=） | 需登录 |
| POST | `/api/domains` | 新增 | 需登录 |
| GET/PUT/DELETE | `/api/domains/:id` | 详情 / 更新 / 删除 | 需登录 |
| POST | `/api/domains/import` | 批量导入（body `{text}`） | 需登录 |
| POST | `/api/domains/:id/check` | 强制即时检测 | 需登录 |
| GET | `/api/history` | 历史（?domain=&status=&from=&to=&page=&size=&export=csv） | 需登录 |
| GET | `/api/notifications` | 通知配置列表 | 需登录 |
| PUT | `/api/notifications/:channel` | 更新渠道配置 | 需登录 |
| POST | `/api/notifications/test` | 测试发送（body `{channel}`） | 需登录 |
| GET | `/api/stats` | 仪表盘统计 | 需登录 |

---

## 7. 检测与通知机制

- **检测路由**：gTLD → RDAP（IANA bootstrap 解析注册局端点）；`.cn` → 先 `rdap.cn`，失败回退 `WHOIS_API_BASE` + `WHOIS_API_KEY`。
- **状态枚举**：`ok` / `expired` / `redemptionPeriod` / `pendingDelete` / `available`(可注册=drop) / `unknown`。
- **自适应频率**：Cron 每分钟拉取 `next_check_at ≤ now` 的域名（每次最多 50 个），按优先级写入下次检测时间：`high`=5 分钟、`normal`=1 小时、`low`=6 小时；检测失败重试 2 分钟。
- **通知事件**：状态变为 `available` → **drop 通知**；首次进入 `redemptionPeriod` / `pendingDelete` → **预警通知**。同域名在 `suppress_interval_minutes` 内不重复打扰（按 `domains.last_notify_at` 判定）。历史保留 90 天后自动清理。

---

## 8. 常见问题

- **D1 数据库怎么建**：采用 Cloudflare 原生 Git 集成时 D1 **不会自动建**、`database_id` 也不会自动回填。需先 `wrangler d1 create domain_monitor`（或 Dashboard 建）并把 id 填进 `wrangler.toml` 第 12 行，再 `git push` 触发部署，部署后再执行一次 `wrangler d1 migrations apply domain_monitor --remote` 建表（详见 §4.1 / §4.3）。
- **忘记后台登录密码**：在 Cloudflare 重新设置/编辑变量 `ADMIN_PASSWORD`（或 `wrangler secret put ADMIN_PASSWORD`），下次登录即用新密码；如需让所有已登录设备立即失效，同时轮换 `SESSION_SECRET`。详见 §4.2。
- **登录后接口 401**：检查 `ADMIN_PASSWORD` / `SESSION_SECRET` 是否正确设置；确认前端与 Worker 同站（自定义域）以携带 `dm_session` Cookie。
- **.cn 检测 unknown**：RDAP 不可达且未配置 `WHOIS_API_BASE` / `WHOIS_API_KEY`，属预期降级行为。

---

## 9. 许可证

MIT
