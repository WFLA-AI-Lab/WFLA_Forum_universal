# 世外墙 WFLA Wall

上海市世外中学校园论坛 —— 一个**可扩展、可监管、可交接**的校园社区平台。

- 注册采用**邀请制**：邀请码一次性、可设有效期；注册后账号为 `pending`，必须由管理员在后台**手动激活**。
- 登录方式：内部账号密码、GitHub OAuth、Microsoft OAuth（第三方身份需先在论坛账号内完成绑定）。
- **游客可以浏览**公开内容；发帖、举报、通知等需要登录。
- **不允许匿名发帖**：每位用户在其个人主页与所有帖子中都公开显示**真实中文姓名与届别**，管理员可随时查看完整身份。
- 监管由教师、AI Lab 与 Computerization 信息化社负责人共同负责（最终名单待定）。

当前版本：**v0.1.0** ｜ API：**v1** ｜ 数据库结构：**7**

---

## 技术框架

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 运行时 | Node.js >= 22.12 | 自托管用 `tsx` 直接跑 TypeScript；也支持 Cloudflare Workers |
| 后端框架 | **TypeScript + Hono** | 轻量、类型友好、多运行时（Workers / Node） |
| 数据库 | **SQLite（better-sqlite3）** / Cloudflare D1 | 自托管用文件库；D1 为 Cloudflare 托管版本 |
| 存储 | 本地文件系统 / Cloudflare R2 | 媒体与附件 |
| 校验 | **Zod** | 所有输入严格校验 |
| 密码 | **bcryptjs**（cost 12） | 密码散列，绝不明文存储 |
| HTML 净化 | **sanitize-html** | Markdown 渲染后再做白名单净化 |
| 测试 | **Vitest + Miniflare** | 单元 / 集成测试 |
| 前端 | **React 19 + TypeScript + Vite** | 单页应用 |
| 前端架构 | **容器 / 皮肤分离（Skin Contract v1）** | 换皮肤 = 换整套布局，状态与请求完全复用 |
| 反向代理（可选） | **Caddy** | 自动 HTTPS 证书 |

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

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`docs/API.md`](docs/API.md) | **接口文档**：所有接口的方法、路径、权限、请求体、响应与错误码 |
| [`docs/FRONTEND_SKIN_GUIDE.md`](docs/FRONTEND_SKIN_GUIDE.md) | **皮肤开发指南**：容器 / 皮肤分层、如何新增皮肤、契约版本规则 |
| [`docs/RELEASE_AND_ARCHIVE.md`](docs/RELEASE_AND_ARCHIVE.md) | **发版与存档**：版本号规则、发版 checklist、迁移表、备份约定 |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | 变更日志（每次发版必须更新） |
| [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) | 项目总体规划（目标、范围、数据模型与路线图） |

---

## 快速开始（本地开发）

前置：Node.js >= 22.12。

```bash
npm install
npm --prefix frontend install
npm run migrate:local      # 初始化本地数据库
npm run dev                # 启动后端（wrangler dev）

# 另开一个终端
npm --prefix frontend run dev   # 启动前端（http://localhost:5173）
```

自托管（Node + SQLite）方式：

```bash
npm install
npm --prefix frontend install
npm run selfhost:migrate       # 应用迁移
npm run selfhost:build         # 构建前端
npm run selfhost:start         # 启动服务
```

Windows 服务器上推荐使用仓库内的一键脚本：`scripts/一键配置.cmd`（首次）与
`scripts/一键启动.cmd`（之后每次启动）。

---

## 前端皮肤系统

前端被拆成**容器**与**皮肤**两层：`App.tsx` 独占所有状态、请求与权限判断，皮肤只接收一个
`SkinContext` 并负责渲染（可以任意重排布局）。

- 默认主 UI 是**仿 X 风格的三段式信息流布局**（`x`）。
- 备选 `endfield` 皮肤为档案式布局。
- 管理后台「外观」标签可选择默认皮肤与允许的皮肤白名单，**保存后立即生效**。
- 新增皮肤三步：写组件 → 注册到 `frontend/src/skins/registry.ts` → 注册到 `src/modules/site/skins.ts`。

详见 [`docs/FRONTEND_SKIN_GUIDE.md`](docs/FRONTEND_SKIN_GUIDE.md)。

---

## 版本与发版

版本号唯一来源是 `src/version.ts`：

```ts
APP_VERSION        = '0.1.0'   // 应用版本
API_VERSION        = 'v1'      // HTTP 契约版本
SCHEMA_VERSION     = 7         // 数据库结构版本（= 最高迁移序号）
SKIN_CONTRACT_VERSION = 1      // 前端皮肤契约版本
```

发版流程、迁移对应表、备份与存档约定见 [`docs/RELEASE_AND_ARCHIVE.md`](docs/RELEASE_AND_ARCHIVE.md)。

---

## 开发检查

提交前必须全绿：

```bash
npm run type-check
npm run lint
npm test
npm --prefix frontend run type-check
npm --prefix frontend run build
```

---

## 安全设计

- 会话 Cookie：`HttpOnly`；生产环境 `Secure + SameSite=Strict`，本地开发自动降级便于联调。
- 服务端只存会话哈希，支持随时撤销。
- 登录按 IP 限流；邀请码一次性、可过期；OAuth 使用一次性 state 防 CSRF。
- 所有输入经 Zod 校验；正文 HTML 服务端白名单净化后再存储。
- 敏感操作全部写审计日志；权限模型默认拒绝。
- OAuth Secret 与 owner 密码**永不回显**；密钥、数据库、证书、私有部署教程均被排除在版本控制之外。
- **真实姓名与届别公开，无匿名发帖**，管理员可追溯任何一次发布行为。

---

## 部署要点

- **公网地址**：`https://wflawall.zh.kg`（当前内测环境为 HTTP over 内网穿透）。
- 服务器没有公网 IP 时，通过内网穿透把本地端口映射到中转节点即可，**只需穿透业务端口**。
- 反向代理（Caddy）可自动申请并续期 Let's Encrypt 免费证书；需要域名解析指向可达的入口。
- 部署后务必：执行迁移 → 构建前端 → 同步产物 → （改了后端代码则）重启进程 → 核对
  `GET /api/v1/health` 的版本号。