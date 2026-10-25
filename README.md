# WFLA Wall 世外墙

<div align="left">

**中文** · [English](#english)

</div>

上海市世外中学校园论坛 —— 一个**可扩展、可监管、可交接**的校园社区平台，
自托管（Node.js + SQLite），通过内网穿透提供公网访问。

Current version: **v0.3.1** ｜ API: **v1** ｜ DB schema: **11** ｜ Skin contract: **2**

---

## 中文

### 核心特性

- **邀请制注册**：邀请码一次性、可设有效期；注册后账号为 `pending`，必须由管理员在后台**手动激活**。
- **多种登录方式**：内部账号密码、GitHub OAuth、Microsoft OAuth（第三方身份需先绑定到论坛账号）。
- **游客可浏览**公开内容；发帖、举报、通知等需要登录。
- **皮肤偏好跨设备同步**：登录用户在「设置」页选择整套布局皮肤并同步到账号；游客仅保存在本浏览器。
- **不允许匿名发帖**：每位用户在其个人主页与所有帖子中都公开显示**真实中文姓名与入学届别**，管理员可随时查看完整身份。
- **独立管理后台**：管理员可查看可视化概览、管理账号与内容、处理举报、发放邀请码、发布公告并审计敏感操作；owner 可在线配置皮肤、注册策略与 OAuth。
- 监管由教师、AI Lab 与 Computerization 信息化社负责人共同负责（最终名单待定）。
- 所有敏感操作均记录**审计日志**；权限模型默认拒绝。

### 技术框架

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 运行时 | Node.js >= 22.12 | 自托管用 `tsx` 直接跑 TypeScript |
| 后端框架 | TypeScript + Hono | 轻量、类型友好、多运行时 |
| 数据库 | SQLite（better-sqlite3） | 自托管文件库，部署简单、备份容易 |
| 校验 | Zod | 所有输入严格校验 |
| 密码 | bcryptjs（cost 12） | 密码散列，绝不明文存储 |
| HTML 净化 | sanitize-html | Markdown 渲染后再做白名单净化 |
| 测试 | Vitest + Miniflare | 单元 / 集成测试 |
| 前端 | React 19 + TypeScript + Vite | 单页应用；论坛皮肤 + 独立管理后台 |
| 前端架构 | 容器 / 皮肤分离（Skin Contract v2） | 换皮肤 = 换整套布局，状态与请求完全复用；管理后台独立于皮肤 |
| 反向代理（可选） | Caddy | 自动 HTTPS 证书 |

> 早期曾评估 Cloudflare Workers / Pages / D1，现行发布形态为**自托管 Node + SQLite**
> 经内网穿透对外提供。仓库中残留的 `wrangler.toml` / D1 引用是兼容层的遗留接口，
> 不会在本部署方案中运行；后续如不再需要会一并清理。

### 目录结构

```
.
├─ src/                     # 后端
│  ├─ index.ts              # Hono 应用入口（路由挂载、CORS、安全头、错误处理）
│  ├─ version.ts            # ★ 版本号唯一来源
│  ├─ modules/              # 领域模块
│  │  ├─ identity/          # 登录、会话、用户
│  │  ├─ content/           # 板块、话题、回复、搜索
│  │  ├─ moderation/        # 举报、处置、公告、审计
│  │  ├─ notification/      # 站内通知
│  │  ├─ settings/          # 运行时高级设置、网络诊断
│  │  ├─ preferences/       # 用户偏好（当前含皮肤偏好）
│  │  ├─ site/              # 站点外观 / 皮肤注册与配置
│  │  └─ access/            # 角色权限判定
│  ├─ routes/               # OAuth、邀请等独立路由
│  ├─ migrations/           # SQL 迁移（只增不改）
│  └─ selfhost/             # 自托管 Node 服务实现
├─ frontend/
│  └─ src/
│     ├─ App.tsx            # ★ 容器：全部状态 / 请求 / 权限 / 路由
│     └─ skins/             # ★ 皮肤：纯展示布局
│        ├─ contract.ts     #   皮肤契约（唯一类型来源）
│        ├─ registry.ts     #   皮肤注册表（id → 懒加载组件）
│        ├─ x/               #   仿 X 皮肤（默认主 UI）
│        └─ endfield/        #   Endfield 皮肤
├─ scripts/                 # 一键配置 / 一键启动 / 迁移 / 备份
└─ docs/                    # 文档
```

### 文档索引

| 文档 | 内容 |
| --- | --- |
| [`docs/API.md`](docs/API.md) | **接口文档**：所有接口的方法、路径、权限、请求体、响应与错误码 |
| [`docs/FRONTEND_SKIN_GUIDE.md`](docs/FRONTEND_SKIN_GUIDE.md) | **皮肤开发指南**：容器 / 皮肤分层、如何新增皮肤、契约版本规则 |
| [`docs/RELEASE_AND_ARCHIVE.md`](docs/RELEASE_AND_ARCHIVE.md) | **发版与存档**：版本号规则、发版 checklist、迁移表、备份约定 |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | 变更日志（每次发版必须更新） |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | **架构文档（中英双语）**：总览、模块、部署拓扑、交接清单 |
| [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) | 项目总体规划（目标、范围、数据模型与路线图） |
| [`SELFHOST_README.md`](SELFHOST_README.md) | 自托管部署说明（Windows / Node.js） |

### 快速开始（本地开发）

前置：Node.js >= 22.12。

```bash
npm install
npm --prefix frontend install
npm run selfhost:migrate       # 初始化本地数据库
npm run selfhost:start         # 启动后端 + 静态前端
```

Windows 服务器上推荐使用仓库内的一键脚本：`scripts/一键配置.cmd`（首次）与
`scripts/一键启动.cmd`（之后每次启动）。

### 前端皮肤系统

前端被拆成**容器**与**皮肤**两层：`App.tsx` 独占所有状态、请求与权限判断，皮肤只接收一个
`SkinContext` 并负责渲染（可以任意重排布局）。

- 默认主 UI 是**仿 X 风格的三段式信息流布局**（`x`）。
- 备选 `endfield` 皮肤为档案式布局。
- 每个登录用户可在「设置」页编辑昵称、头像并选择皮肤，偏好会**同步到账号**（跨设备沿用）。
- 游客固定使用 X 皮肤；Endfield 登录后才可切换。「设置」同时承担访客登录入口。
- 管理后台「外观」标签可选择默认皮肤与允许的皮肤白名单，**保存后立即生效**。
- 新增皮肤三步：写组件 → 注册到 `frontend/src/skins/registry.ts` → 注册到 `src/modules/site/skins.ts`。

详见 [`docs/FRONTEND_SKIN_GUIDE.md`](docs/FRONTEND_SKIN_GUIDE.md)。

### 版本与发版

版本号唯一来源是 `src/version.ts`：

```ts
APP_VERSION        = '0.3.1'   // 应用版本
API_VERSION        = 'v1'      // HTTP 契约版本
SCHEMA_VERSION     = 11        // 数据库结构版本（= 最高迁移序号）
SKIN_CONTRACT_VERSION = 2      // 前端皮肤契约版本
```

发版流程、迁移对应表、备份与存档约定见 [`docs/RELEASE_AND_ARCHIVE.md`](docs/RELEASE_AND_ARCHIVE.md)。

### 开发检查

提交前必须全绿：

```bash
npm run type-check
npm run lint
npm test
npm --prefix frontend run type-check
npm --prefix frontend run build
```

### 安全设计

- 会话 Cookie：`HttpOnly`；生产环境 `Secure + SameSite=Strict`，本地开发自动降级便于联调。
- 服务端只存会话哈希，支持随时撤销。
- 登录按 IP 限流；邀请码一次性、可过期；OAuth 使用一次性 state 防 CSRF。
- 所有输入经 Zod 校验；正文 HTML 服务端白名单净化后再存储。
- 敏感操作全部写审计日志；权限模型默认拒绝。
- OAuth Secret 与 owner 密码**永不回显**；密钥、数据库、证书、私有部署教程均被排除在版本控制之外。
- **真实姓名与入学届别公开，无匿名发帖**，管理员可追溯任何一次发布行为。

### 部署要点

- **公网地址**：`https://wflawall.zh.kg`（当前内测环境为 HTTP over 内网穿透）。
- 服务器没有公网 IP 时，通过内网穿透把本地端口映射到中转节点即可，**只需穿透业务端口**。
- 反向代理（Caddy）可自动申请并续期 Let's Encrypt 免费证书；需要域名解析指向可达的入口。
- 部署后务必：执行迁移 → 构建前端 → 同步产物 → （改了后端代码则）重启进程 → 核对
  `GET /api/v1/health` 的版本号。

---

## English

WFLA Wall is the campus forum for Shanghai World Foreign Language Academy —
self-hosted (Node.js + SQLite) with tunnel-based public access, built around
**extensibility, moderation, and maintainable handover**.

### Highlights

- **Invite-only registration** — one-time codes with optional expiry; every new
  account is `pending` and must be **manually activated by an admin**.
- **Multiple sign-in methods** — internal username/password, GitHub OAuth and
  Microsoft OAuth (third-party identities must be linked to a forum account first).
- **Guests can browse** public content; posting, reporting and notifications need an account.
- **Cross-device profile and skin preference** — signed-in members edit their
  avatar/nickname and pick a whole-layout skin on the Settings page; guests
  always use the X skin until they sign in.
- **Standalone admin console** — visual overview, account/content moderation,
  reports, invitations, announcements, audit trail, and owner-only runtime settings.
- **No anonymous posting** — every user's real Chinese name and enrolment year
  are shown on their profile and on every post; admins can trace any action.
- Moderation is jointly responsible to teachers, AI Lab and the Computerization
  society leads (final roster TBD).
- Every sensitive action is written to an **audit log**; permissions are
  deny-by-default with rank checks.

### Tech stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Runtime | Node.js >= 22.12 | TypeScript via `tsx` |
| Backend | TypeScript + Hono | Lightweight, typed, multi-runtime |
| Database | SQLite (better-sqlite3) | File-based; easy backup and ops |
| Validation | Zod | Strict input schemas everywhere |
| Passwords | bcryptjs (cost 12) | Hashed, never stored in plain text |
| HTML sanitising | sanitize-html | Whitelist after Markdown rendering |
| Tests | Vitest + Miniflare | Unit / integration |
| Frontend | React 19 + TypeScript + Vite | Single-page app |
| Frontend architecture | Container / skin split (Skin Contract v2) | A skin replaces the whole layout; state and requests are shared |
| Reverse proxy (optional) | Caddy | Automatic HTTPS certificates |

> The very first design evaluated Cloudflare Workers / Pages / D1. The current
> release target is **self-hosted Node + SQLite behind a tunnel**. Residual
> `wrangler.toml` / D1 references are compat-layer remnants kept for
> portability; they are not exercised by this deployment and will be pruned
> when no longer needed.

### Repository layout

```
.
├─ src/                     # Backend
│  ├─ index.ts              # Hono app entry (routes, CORS, headers, errors)
│  ├─ version.ts            # ★ Single source of truth for versions
│  ├─ modules/              # Domain modules
│  │  ├─ identity/          # Auth, sessions, users
│  │  ├─ content/           # Boards, threads, replies, search
│  │  ├─ moderation/        # Reports, actions, announcements, audit
│  │  ├─ notification/      # In-app notifications
│  │  ├─ settings/          # Runtime advanced settings, network diagnostics
│  │  ├─ preferences/       # Per-account preferences (currently skin)
│  │  ├─ site/              # Site appearance / skin registry & config
│  │  └─ access/            # Role checks
│  ├─ routes/               # OAuth, invitations
│  ├─ migrations/           # Append-only SQL migrations
│  └─ selfhost/             # Self-hosted Node server implementation
├─ frontend/
│  └─ src/
│     ├─ App.tsx            # ★ Container: all state / requests / routing
│     └─ skins/             # ★ Pure presentation layouts
│        ├─ contract.ts     #   Skin contract (single type source)
│        ├─ registry.ts     #   id → lazy-loaded component
│        ├─ x/               #   X-style skin (default)
│        └─ endfield/        #   Endfield skin
├─ scripts/                 # one-click setup / start / migrate / backup
└─ docs/                    # docs
```

### Documentation

| Doc | Purpose |
| --- | --- |
| [`docs/API.md`](docs/API.md) | Full HTTP API (methods, paths, auth, payloads, errors) — **Chinese** |
| [`docs/FRONTEND_SKIN_GUIDE.md`](docs/FRONTEND_SKIN_GUIDE.md) | How to build a new skin — **Chinese** |
| [`docs/RELEASE_AND_ARCHIVE.md`](docs/RELEASE_AND_ARCHIVE.md) | Release rules, migration table, backups — **Chinese** |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Changelog (must be updated every release) — **Chinese** |
| [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) | Overall project plan — **Chinese** |
| [`SELFHOST_README.md`](SELFHOST_README.md) | Self-host deployment notes (Windows / Node.js) — **Chinese** |

English translations of the API and skin guide are on the roadmap; the type
contract in `frontend/src/skins/contract.ts` and the route definitions in
`src/` are the authoritative, language-neutral references.

### Quick start (local development)

Prerequisites: Node.js >= 22.12.

```bash
npm install
npm --prefix frontend install
npm run selfhost:migrate       # create / migrate the SQLite database
npm run selfhost:start         # start backend + static frontend
```

On a Windows server prefer the bundled one-click scripts:
`scripts/一键配置.cmd` (first run) and `scripts/一键启动.cmd` (every start after).

### Skin system

The frontend is split into a **container** (`App.tsx`) that owns all state,
network calls and permissions, and **skins** — pure presentation components
that receive one `SkinContext` and may rearrange the whole page.

- The default main UI is the **X-style three-column feed** (`x`).
- `endfield` is the alternative archive-style layout.
- Every signed-in member edits their profile and picks a skin on the Settings
  page; both follow the account across devices. Guests always use the X skin.
- Admins pick the site default skin and allow-list in the admin console
  (`Appearance` tab); changes apply immediately.
- Adding a skin is three steps: write the component -> register in
  `frontend/src/skins/registry.ts` -> register the descriptor in
  `src/modules/site/skins.ts`.

See [`docs/FRONTEND_SKIN_GUIDE.md`](docs/FRONTEND_SKIN_GUIDE.md) (Chinese).

### Versioning

Single source of truth is `src/version.ts`:

```ts
APP_VERSION           = '0.3.1'
API_VERSION           = 'v1'
SCHEMA_VERSION        = 11
SKIN_CONTRACT_VERSION = 2
```

Release flow, migration table and backup rules:
[`docs/RELEASE_AND_ARCHIVE.md`](docs/RELEASE_AND_ARCHIVE.md).

### Pre-commit checks (all must pass)

```bash
npm run type-check
npm run lint
npm test
npm --prefix frontend run type-check
npm --prefix frontend run build
```

### Security model

- Session cookie is `HttpOnly`; production uses `Secure + SameSite=Strict`
  (local development relaxes it for convenience).
- The server stores only session **hashes**; sessions can be revoked instantly.
- Login is rate-limited per IP; invitation codes are one-time and expirable;
  OAuth flows use one-time `state` for CSRF protection.
- All input is validated with Zod; rendered HTML is server-sanitised with a
  whitelist before storage.
- Every sensitive operation is written to the audit log; permissions are
  deny-by-default.
- OAuth secrets and the owner password are never echoed back; `.env`, SQLite
  files, certificates and private deployment guides are excluded from version
  control.
- **Real names and enrolment years are public; no anonymous posting** — any
  published item can be traced to its author.

### Deployment notes

- **Public URL**: `https://wflawall.zh.kg` (current beta serves HTTP over a tunnel).
- The server has no public IP; a tunnel maps the local port to a relay node —
  **only the business port needs to be exposed**.
- The optional Caddy reverse proxy issues and renews Let's Encrypt certificates
  automatically; DNS must point to a reachable entry point.
- After deploying: run migrations -> build frontend -> sync artefacts -> restart
  the process if backend code changed -> verify `GET /api/v1/health`.

---

## License

ISC — see [LICENSE](LICENSE).
