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
├── .github/workflows/            # deploy-worker.yml / deploy-pages.yml
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

## 4. 部署到 Cloudflare（生产）

### 4.1 前置：Cloudflare 账号准备

1. 注册 Cloudflare 账号，获取 **Account ID**（Dashboard 右侧）。
2. 在 Cloudflare 创建 **API Token**（权限：Workers、D1、Pages 编辑），记为 `CF_API_TOKEN`。
3. 在 Cloudflare 控制台创建一个 **D1 数据库**，名称 `domain_monitor`，把它的 **database_id** 填到根 `wrangler.toml` 的 `d1_databases.database_id`。

### 4.2 设置 Secrets（务必使用强随机值）

```bash
cd worker
wrangler secret put ADMIN_PASSWORD        # 单管理员登录口令
wrangler secret put SESSION_SECRET        # HMAC 签名密钥（建议 >=32 字节随机串）
wrangler secret put RESEND_API_KEY        # 邮件（Resend）
wrangler secret put TG_BOT_TOKEN          # Telegram Bot Token
wrangler secret put TG_CHAT_ID            # Telegram 接收 Chat ID
wrangler secret put PUSHPLUS_TOKEN        # PushPlus 微信 Token
wrangler secret put NOTIF_WEBHOOK_URL     # 通用 Webhook URL
wrangler secret put WECOM_WEBHOOK_URL     # 企业微信机器人 Webhook URL
wrangler secret put WHOIS_API_BASE        # .cn 回退付费 WHOIS/可用性 API 基址
wrangler secret put WHOIS_API_KEY         # 付费 WHOIS API Key
```

> 不配置某渠道的凭据，该渠道在发送时会被跳过（不影响其他渠道与系统运行）。

### 4.3 部署 Worker + 迁移 D1

```bash
cd worker
npx wrangler d1 migrations apply domain_monitor --remote
npx wrangler deploy
```

也可直接 `git push origin main`，由 `.github/workflows/deploy-worker.yml` 自动完成「创建 DB → 迁移 → 注入 Secrets → 部署」。

### 4.4 部署前端到 Pages

方式 A — Git 集成（推荐）：Cloudflare Dashboard → Pages → 连接 GitHub 仓库，框架预设 **Vite**，构建目录 `dist`，构建命令 `npm run build`（根目录 `frontend`）。

方式 B — 手动：

```bash
cd frontend && npm install && npm run build
npx wrangler pages deploy dist --project-name=domain-drop-monitor
```

或直接 `git push`，由 `.github/workflows/deploy-pages.yml` 自动构建部署。

### 4.5 自定义域（推荐，避免跨域 Cookie 问题）

将 Worker 与 Pages 绑定到**同一 zone / 自定义域**（如 `monitor.example.com`），确保 API 请求与前端同站，`dm_session` Cookie 可正常写入与携带。

---

## 5. GitHub 仓库 Secrets（CI 用）

在 GitHub 仓库 `Settings → Secrets and variables → Actions` 中添加：

| Secret | 说明 |
|---|---|
| `CF_API_TOKEN` | Cloudflare API Token（Workers/D1/Pages 编辑权限） |
| `CF_ACCOUNT_ID` | Cloudflare Account ID |
| `ADMIN_PASSWORD` | 单管理员登录口令 |
| `SESSION_SECRET` | HMAC 签名密钥（>=32 字节随机） |
| `RESEND_API_KEY` | 邮件渠道 |
| `TG_BOT_TOKEN` / `TG_CHAT_ID` | Telegram |
| `PUSHPLUS_TOKEN` | PushPlus 微信 |
| `NOTIF_WEBHOOK_URL` | 通用 Webhook |
| `WECOM_WEBHOOK_URL` | 企业微信机器人 |
| `WHOIS_API_BASE` / `WHOIS_API_KEY` | .cn 回退付费 WHOIS API |

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

- **本地 `wrangler dev` 报 D1 错误**：确认已执行 `wrangler d1 create` 并在 `wrangler.toml` 填好 `database_id`。
- **登录后接口 401**：检查 `ADMIN_PASSWORD` / `SESSION_SECRET` 是否正确设置；确认前端与 Worker 同站（自定义域）以携带 Cookie。
- **.cn 检测 unknown**：RDAP 不可达且未配置 `WHOIS_API_BASE` / `WHOIS_API_KEY`，属预期降级行为。

---

## 9. 许可证

MIT
