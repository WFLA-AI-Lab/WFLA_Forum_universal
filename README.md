# WFLA Wall Backend

世外墙 WFLA Wall 后端 API。注册采用邀请制（邀请码注册后必须由管理员手动激活）。登录方式为内部账号密码或 Microsoft OAuth（需先在论坛账号内绑定 Microsoft 身份）。游客可以浏览公开内容；发帖、举报和通知需要登录。所有用户公开显示真实中文姓名与届别。

## 技术栈

- TypeScript + Hono
- Cloudflare Workers + D1 (SQLite) + R2
- bcryptjs（密码散列）
- sanitize-html（服务端 HTML 白名单净化）
- Zod（输入校验）
- Vitest + Miniflare（测试）

## 快速开始

```bash
npm install
npm run migrate:local
npm run dev
```

前端：

```bash
cd frontend
npm install
npm run dev
```

## 部署前

1. `wrangler d1 create wfla-wall`，把 `database_id` 填入 `wrangler.toml`。
2. `wrangler r2 bucket create wfla-wall-media`。
3. `wrangler secret put AUTH_SESSION_SECRET`（32 字节随机值）。
4. Microsoft 登录（可选）：
   - `wrangler secret put MS_CLIENT_ID`
   - `wrangler secret put MS_CLIENT_SECRET`
   - 在 `wrangler.toml [vars]` 中设置 `MS_REDIRECT_URI = "https://你的域名/api/v1/auth/microsoft/callback"`，并在 Entra 应用注册中加入同一重定向 URI。
5. `npm run migrate:remote`。
6. `wrangler deploy`。

## 初始账号

```bash
node scripts/create-owner.mjs <username> <password> <真实中文姓名> <届别>
```

（设置 `WFLA_DB_PATH` 指向本地 D1 SQLite 文件；密码需 ≥10 位，含大小写、数字、符号。）

## API

基础路径：`/api/v1`

- 认证：`POST /login`、`POST /logout`、`GET /me`
- Microsoft：`GET /auth/microsoft/login`、`GET /auth/microsoft/callback`、`POST /auth/microsoft/link`
- 邀请：`POST /register`、`POST /invitations`、`GET /invitations`、`POST /users/:id/activate`
- 用户：`GET /users`（监管）、`GET /users/:id`、`PATCH /users/:id`、`POST /users`（管理员）、`POST /users/:id/password`、`POST /users/:id/status`、`POST /users/:id/role`
- 板块/内容：`GET|POST /boards`、`GET|POST /boards/:slug/threads`、`GET /threads/:id`、`POST /threads/:id/posts`、`PATCH|DELETE /posts/:id`、`POST /threads/:id/view`
- 互动：`PUT|DELETE /threads/:id/bookmark`、`GET /bookmarks`、`PUT|DELETE /reactions`、`GET /search`
- 公告：`POST /announcements`（admin）、`GET /announcements`
- 举报/监管：`POST /reports`、`GET /reports`、`POST /reports/:id/assign|resolve|reject`、`PATCH /threads/:id/status`、`PATCH /posts/:id/status`、`GET /audit-logs`
- 通知：`GET /notifications`、`POST /notifications/read-all`、`POST /notifications/:id/read`

## 安全设计

- 会话 Cookie：HttpOnly；生产 `Secure + SameSite=Strict`（`__Host-` 前缀），本地开发自动降级为非 Secure 以便联调。
- 服务端只存会话哈希，支持撤销。
- 登录限流；邀请码一次性、可过期。
- 输入全部 Zod 校验；HTML 服务端白名单净化。
- 敏感操作写审计日志；权限默认拒绝。
- 真实姓名与届别公开，无匿名发帖。

## 开发

```bash
npm run lint
npm run type-check
npm test
```
