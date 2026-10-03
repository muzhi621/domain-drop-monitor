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

## 4. 部署到 Cloudflare（Cloudflare 直接绑定 GitHub 仓库，push 即部署）

本仓库已内置 GitHub Actions：**把 GitHub 仓库绑定到 Cloudflare（提供 `CF_API_TOKEN`）后，每次 `git push` 到 `main` 即自动部署**——创建/绑定 D1 → 解析 `database_id` 并写入配置 → 迁移建表 → 注入密钥 → 部署 Worker + 前端 Pages。你只需在 Cloudflare 拿到 Account ID 与 API Token，并在 GitHub 配置好 Secrets（见 §5），其余全自动，无需手动改 `wrangler.toml`。

### 4.1 一次性准备（本地只需做这两步）

1. 在 Cloudflare 拿到 **Account ID**（Dashboard 右侧）与 **API Token**（权限：Workers、D1、Pages 编辑），记为 `CF_API_TOKEN`。
2. 在 GitHub 仓库 `Settings → Secrets and variables → Actions` 填入 §5 的 12 个 Secret（`CF_API_TOKEN` / `CF_ACCOUNT_ID` + 10 个运行密钥）。
3. `git push -u origin main` —— CI 会自动创建名为 `domain_monitor` 的 D1、解析其 `database_id`、建表、部署。**无需手动编辑 `wrangler.toml`。**

> 若你更习惯纯 Dashboard「连接 Git」（不使用 Actions），见 §4.4 备选方案。

### 4.2 登录密码（变量 `ADMIN_PASSWORD`，可设初始密码 / 忘记后重置）★

- 后台登录口令完全由 Cloudflare **变量 `ADMIN_PASSWORD`** 控制，代码中不做硬编码。
- **设置初始密码**：Cloudflare Dashboard → 你的 Worker → Settings → Variables → 添加变量 `ADMIN_PASSWORD`（类型选 **Secret**），或用命令 `wrangler secret put ADMIN_PASSWORD` 输入口令。
- **忘记密码 → 重置**：直接重新设置 `ADMIN_PASSWORD`（Dashboard 编辑该变量，或再次 `wrangler secret put ADMIN_PASSWORD`）。改完**下次登录即用新密码**，无需改代码、无需重新部署。
- **强制全部下线**：`SESSION_SECRET` 用于签名登录 Cookie。修改/轮换 `SESSION_SECRET` 后，所有已登录会话立即失效（需重新登录）。单独改 `ADMIN_PASSWORD` 不会让已签发的 Cookie 失效（旧会话 7 天内仍有效）；如需立即作废可同时轮换 `SESSION_SECRET`。
- 两个变量均建议在 Cloudflare 中设为 **Secret**（隐藏明文），并使用强随机值。

### 4.3 设置运行密钥（Secrets / 变量，按需）

除 `ADMIN_PASSWORD` / `SESSION_SECRET` 外，各通知渠道凭据也是 Cloudflare Secret，未配置则对应渠道发送时自动跳过：

```bash
cd worker
wrangler secret put RESEND_API_KEY        # 邮件（Resend）
wrangler secret put TG_BOT_TOKEN          # Telegram Bot Token
wrangler secret put TG_CHAT_ID            # Telegram 接收 Chat ID
wrangler secret put PUSHPLUS_TOKEN        # PushPlus 微信 Token
wrangler secret put NOTIF_WEBHOOK_URL     # 通用 Webhook URL
wrangler secret put WECOM_WEBHOOK_URL     # 企业微信机器人 Webhook URL
wrangler secret put WHOIS_API_BASE        # .cn 回退付费 WHOIS/可用性 API 基址
wrangler secret put WHOIS_API_KEY         # 付费 WHOIS API Key
```

> 这些也可以在 Cloudflare Dashboard → Worker → Settings → Variables 里直接添加；通过 GitHub Actions 部署时则统一在 GitHub Secrets 配置（CI 自动 `wrangler secret put` 注入）。

### 4.4 备选：Cloudflare Dashboard「连接 Git」（不使用 Actions）

- **前端 Pages**：Dashboard → Workers & Pages → 创建 → Pages → 连接 Git 仓库 → 选本仓库 → 框架预设 **Vite**，构建目录 `dist`，构建命令 `npm run build`（根目录 `frontend`）。保存后每次 push 自动重新部署。
- **后端 Worker + D1**：Dashboard 创建 Worker 并连接 Git 可自动部署代码，但 **D1 建表需在 CLI 执行一次**：`wrangler d1 migrations apply domain_monitor --remote`。推荐仍用 §4.1 的 Actions 以省去手动步骤。
- 若同时启用 Actions 与 Dashboard 连接，二者会重复部署同一项目，建议**二选一**。

### 4.5 自定义域（推荐，避免跨域 Cookie 问题）

将 Worker 与 Pages 绑定到**同一 zone / 自定义域**（如 `monitor.example.com`），确保 API 请求与前端同站，`dm_session` Cookie 可正常写入与携带。不同域时需在前端设置 `VITE_API_BASE=https://<worker-subdomain>.workers.dev`。

### 4.6 本地手动部署（不使用 CI 时）

```bash
cd worker && npx wrangler d1 create domain_monitor   # 把输出 id 填到 wrangler.toml
npx wrangler d1 migrations apply domain_monitor --remote
npx wrangler deploy
cd ../frontend && npm install && npm run build
npx wrangler pages deploy dist --project-name=domain-drop-monitor
```

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

- **D1 数据库怎么建**：用 GitHub Actions 部署时**无需手动建**——`git push` 会自动创建名为 `domain_monitor` 的 D1 并把 `database_id` 写入 `wrangler.toml`、自动执行迁移建表。本地手动部署才需要 `wrangler d1 create` 后填 id。
- **忘记后台登录密码**：在 Cloudflare 重新设置/编辑变量 `ADMIN_PASSWORD`（或 `wrangler secret put ADMIN_PASSWORD`），下次登录即用新密码；如需让所有已登录设备立即失效，同时轮换 `SESSION_SECRET`。详见 §4.2。
- **登录后接口 401**：检查 `ADMIN_PASSWORD` / `SESSION_SECRET` 是否正确设置；确认前端与 Worker 同站（自定义域）以携带 `dm_session` Cookie。
- **.cn 检测 unknown**：RDAP 不可达且未配置 `WHOIS_API_BASE` / `WHOIS_API_KEY`，属预期降级行为。

---

## 9. 许可证

MIT
