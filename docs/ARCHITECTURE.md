# WFLA Wall 架构 / WFLA Wall Architecture

> 本文档面向协作者（后端、前端、运维），描述现行 **v0.6.1** 的真实架构——
> 不是早期设想，而是仓库里实际运行的东西。
> This document describes the architecture as it actually ships in v0.6.1 —
> not the early design sketch, but what the repository runs today.

---

## 1. 总览 / Overview

```
                 ┌──────────────────────────┐
                 │   浏览器 / Browser        │
                 │  React SPA (frontend/)   │
                 └────────────┬─────────────┘
                              │ HTTPS / HTTP
                              ▼
                 ┌──────────────────────────┐
                 │  内网穿透 / tunnel        │   ← 只穿透业务端口 / only the app port
                 │  (mefrp 等 relay)         │
                 └────────────┬─────────────┘
                              ▼
┌─────────────────────────────────────────────────┐
│           Node.js ≥ 22 (tsx 直接运行)             │
│  ┌───────────────────────────────────────────┐  │
│  │  Hono 应用 (src/index.ts)                 │  │
│  │  ├─ CORS + secure headers                 │  │
│  │  ├─ /api/v1/* 领域路由                     │  │
│  │  ├─ 静态前端 (frontend/dist → public/)     │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  SQLite (better-sqlite3)                  │  │
│  │  data/wfla-wall.sqlite  + WAL             │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**一次请求的路径 / Request path**: 浏览器 → 域名 DNS → 隧道中转节点 → 隧道客户端
（本机）→ `127.0.0.1:8888` → Hono → SQLite → JSON/HTML 回程。

**为什么不是 Cloudflare** / Why not Cloudflare: 最初评估过 Workers/Pages/D1，
但部署目标是自有 Windows 服务器 + 免费内网穿透；免费版 Cloudflare 对极小用户量的
自定义域名支持有限，且数据主权要求本地留存。现行方案把 Cloudflare 完全移出链路。

---

## 2. 后端模块 / Backend modules

| 模块 / Module | 职责 / Responsibility | 关键文件 |
| --- | --- | --- |
| `identity` | 登录、会话（HttpOnly Cookie）、用户 CRUD、OAuth 绑定 | `modules/identity/*` |
| `content` | 板块 / 话题 / 回复 / Markdown 渲染与净化 / 搜索 | `modules/content/*` |
| `moderation` | 举报、处置、公告、**审计日志** | `modules/moderation/routes.ts` |
| `notification` | 站内通知（回复 / 公告 / 举报结果） | `modules/notification/routes.ts` |
| `settings` | 运行时高级设置（加密存储）、网络诊断 | `modules/settings/*` |
| `site` | 站点公开配置、**皮肤注册表**（服务端） | `modules/site/*` |
| `preferences` | **用户偏好（v0.2 新增）**：跨设备皮肤选择 | `modules/preferences/*` |
| `admin` | **v0.3 新增**：管理概览、账号详情、内容审核、审计查询与公告管理 | `modules/admin/routes.ts` |
| `access` | 角色等级判定（member→moderator→admin→owner） | `modules/access/service.ts` |
| `routes/*.auth` | GitHub / Microsoft OAuth（登录 + 绑定） | `routes/*-auth.routes.ts` |
| `selfhost` | Node HTTP 服务器、.env 加载、SQLite→D1 兼容层 | `selfhost/*` |

**权限模型 / Permission model**: 每个路由显式调用 `requireUser()` +
`atLeast(role, required)`。默认拒绝；`admin` 以上才能改别人数据；`owner`
才能改站点级配置。所有敏感操作写 `audit_logs`。

**数据模型 / Data model**: 单一 SQLite 文件。核心表（v0.5.0，`SCHEMA_VERSION = 13`）：

- `users` — 用户与身份（真实姓名、入学届别、角色、状态）
- `sessions` — 会话（仅存哈希）
- `boards` / `threads` / `posts` — 内容
- `reports` — 举报
- `notifications` — 站内通知
- `announcements` — 全站公告
- `audit_logs` — 敏感操作
- `invitations` — **v0.4 扩展**：一次性邀请码、有效期、目标角色（member / moderator / admin）、使用与吊销状态
- `oauth_providers` / `oauth_states` — 第三方登录与一次性 OAuth state
- `app_settings` — 运行时配置（含加密的 OAuth Secret）
- `user_preferences` — **v0.2 新增**：每用户偏好（当前 `skin_id`）
- `user_notes` / `sanctions` — **v0.3 新增**：账号管理备注与禁言 / 封禁 / 恢复历史
- `moderation_rules` / `risk_events` / `appeals` — **v0.5 新增**：自动监管规则、风险事件与申诉复核

迁移规则：`src/migrations/` 只增不改；新迁移文件 = 下一序号；
`src/version.ts` 的 `SCHEMA_VERSION` 同步 +1。

---

## 3. 前端 / Frontend

### 3.1 容器 / 皮肤分层（Skin Contract v2）

```
App.tsx (容器 / container)
  │  全部 state、fetch、权限、路由、消息
  │  构建 SkinContext { site, session, data, forms, messages, actions, view }
  ▼
Skin component (纯展示 / pure presentation)
  │  只读 context、调用 actions、渲染 DOM
  │  不 fetch、不存 token、不持服务端数据
  ▼
DOM
```

- **契约**：`frontend/src/skins/contract.ts` 是唯一类型来源，只增不改（见 §4）。
- **注册表**：`frontend/src/skins/registry.ts`（懒加载组件 + body class）
  与 `src/modules/site/skins.ts`（服务端描述）必须保持 id 一致。
- **皮肤切换的两个层面**：
  - **站点层**（管理员）：`GET /site/config` 提供 `default_skin` + 白名单，
    `PATCH /admin/site-config` 修改，立即生效；
  - **用户层**（v0.2 新增）：`site.setSkin(id)` 立即切换 + 写 localStorage；
    登录用户额外 `PUT /me/preferences/skin` 同步到账号，换设备登录自动沿用。
- **降级**：白名单里的皮肤若前端没有实现，`resolveSkin()` 回落到当前占位界面，不白屏。

### 3.2 用户设置页 / Settings page（v0.2 新增）

正式皮肤实现后应提供 `view.name === 'settings'`：

- 整布局预览式皮肤选择器和同步状态；
- 同步状态（`site.skin_preference_status`: `idle / saving / saved / guest / error`）；
- 账号信息（真实姓名、入学届别、角色——论坛无匿名发帖）；
- 入口：左侧导航栏 + 移动端底部导航，所有登录用户可达。

---

### 3.3 独立管理后台 / Standalone admin console（v0.3 新增）

`view.name === "admin"` 时，容器直接挂载 `frontend/src/admin/AdminConsole.tsx`，不经过任何皮肤组件。
后台拥有独立的 `admin.css` 设计系统（Apple 风格、响应式、深色模式、减少动态 / 透明度偏好），因此换皮肤不会影响后台。
`admin` / `owner` 可使用概览、账号、内容、举报、邀请码、公告与板块、审计日志；
`owner` 额外拥有外观、高级设置与系统诊断。所有数据仍由后端权限与审计日志约束，前端隐藏入口不能替代服务端授权。

### 3.4 启动边界 / Boot boundary

- 容器负责开屏动画和懒加载皮肤错误边界；皮肤不拥有启动页，也不能因懒加载失败导致全屏空白。
- 自托管静态服务把缺失的 JS/CSS 识别为 `ASSET_NOT_FOUND`，只有 document navigation 才回退到 `index.html`。
- 发布脚本必须完整替换 `public/`，避免旧皮肤 chunk 与新 `index.html` 混用。

---

## 4. 版本策略 / Versioning

| 字段 | 含义 | 当前 |
| --- | --- | --- |
| `APP_VERSION` | 应用整体版本 | 0.6.1 |
| `API_VERSION` | HTTP 契约版本（破坏性变更才 bump） | v1 |
| `SCHEMA_VERSION` | 数据库结构（= 最高迁移序号） | 13 |
| `SKIN_CONTRACT_VERSION` | 皮肤契约版本（独立于 API） | 3 |

规则：契约只增不改 → 不 bump；重命名/删除/改语义 → bump。
详见 `docs/RELEASE_AND_ARCHIVE.md`。

---

## 5. 部署形态 / Deployment topology（现行）

```
用户浏览器
    │
    ▼  DNS 解析（wflawall.zh.kg）
隧道服务面板的公网入口
    │
    ▼  隧道中转
用户服务器上的隧道客户端（本机）
    │
    ▼  127.0.0.1:8888 (HTTP)
Node.js + Hono（同端口同时提供 API 与静态前端）
    │
    ▼
SQLite 文件 + 前端构建产物 public/
```

**要点 / Key points**：

- **只需穿透一个业务端口**（`PORT`，默认 8888）。SQLite 是文件库，无独立服务端口；
  静态前端与 API 同端口，由 Node 直接托管。
- 可选 Caddy 在 Node 前面做 HTTPS 源站（`127.0.0.1:8443 → 127.0.0.1:8888`），
  隧道指向 Caddy 即可，业务端口仍是 8888。
- `PUBLIC_ORIGIN` 是浏览器实际访问的完整地址，OAuth 回调、Cookie `Secure`
  与 CORS 都基于它。
- 数据（`.env`、`data/*.sqlite`、`backups/`、`certs/`）**永不提交**到 git。

---

## 6. 交接 / Handover checklist

**后端 / Backend**:

- [ ] 读 `src/version.ts`（版本）与 `src/index.ts`（路由挂载顺序）。
- [ ] 新增领域模块 = `src/modules/<name>/{routes,service}.ts` + `src/index.ts` 注册。
- [ ] 新增表 = `src/migrations/000N_*.sql` + `SCHEMA_VERSION` 同步。
- [ ] 跑 `npm run type-check && npm run lint && npm test`。

**前端 / Frontend**:

- [ ] 读 `frontend/src/skins/contract.ts`，不要先读 `App.tsx` 的 JSX。
- [ ] 新皮肤三步：组件 → `registry.ts` → `src/modules/site/skins.ts`。
- [ ] 保证游客态 / 登录态 / 监管态（`isStaff`）都能渲染。
- [ ] `settings` 页面必须可达（每个登录用户）。
- [ ] 跑 `npm --prefix frontend run type-check && npm --prefix frontend run build`。

**运维 / Ops**:

- [ ] 备份：`npm run selfhost:backup`（迁移前必跑）。
- [ ] 迁移：`npm run selfhost:migrate`。
- [ ] 构建：`npm run selfhost:build`。
- [ ] 后端代码改动 → 重启进程；仅前端 → 无需重启。
- [ ] 线上核对：`GET /api/v1/health` 的 `version` 字段。

\n