# WFLA Wall Backend

世外墙 WFLA Wall 后端 API。注册采用邀请制；内测过渡期仍保留管理员分发账号。游客可以浏览公开内容；发帖、举报和通知需要登录。所有用户公开显示真实中文姓名与届别。

## 技术栈

- TypeScript
- Hono
- Cloudflare Workers
- D1 SQLite
- R2 媒体存储
- bcryptjs
- isomorphic-dompurify + marked

## 快速开始

```bash
npm install
npm run migrate:local
npm run dev
```

部署前：

1. 在 `wrangler.toml` 中替换 D1 `database_id`。
2. 创建 R2 bucket `wfla-wall-media`。
3. 设置 secret：`wrangler secret put AUTH_SESSION_SECRET`。
4. 执行 `npm run migrate:remote`。
5. 执行 `wrangler deploy`。

## 初始账号

系统不开放自助注册。迁移后可使用一次性维护命令创建 owner，或在本地 D1 中插入账号。示例维护脚本见 `scripts/create-owner.mjs`。

```bash
node scripts/create-owner.mjs <username> <password> <真实中文姓名> <届别>
```

密码必须至少 10 位，包含大小写字母、数字和符号。

## API

基础路径：`/api/v1`

- `GET /health`
- `POST /register`（邀请码注册，默认待激活）
- `POST /invitations`（管理员发放邀请）
- `GET /invitations`
- `POST /users/:id/activate`（管理员激活注册）
- `POST /login`
- `POST /logout`
- `GET /me`
- `GET /users/:id`
- `PATCH /users/:id`
- `POST /users`（管理员分发账号）
- `POST /users/:id/password`
- `POST /users/:id/status`（监管者处理账号状态）
- `GET /boards`
- `POST /boards`
- `GET /boards/:slug/threads`
- `POST /boards/:slug/threads`
- `GET /threads/:id`
- `POST /threads/:id/posts`
- `PATCH /posts/:id`
- `DELETE /posts/:id`
- `POST /threads/:id/view`
- `POST /reports`
- `GET /reports`
- `POST /reports/:id/assign`
- `POST /reports/:id/resolve`
- `POST /reports/:id/reject`
- `PATCH /threads/:id/status`
- `PATCH /posts/:id/status`
- `GET /audit-logs`
- `POST /announcements`
- `GET /announcements`
- `GET /notifications`
- `POST /notifications/read-all`
- `POST /notifications/:id/read`

## 安全设计

- HttpOnly + Secure + SameSite=Strict 会话 Cookie。
- 服务端保存会话哈希，可随时撤销。
- bcrypt cost 12。
- Markdown 白名单渲染，禁止脚本和任意属性。
- 登录接口限流。
- 权限默认拒绝；敏感操作写审计日志。
- 用户真实姓名和届别对游客公开，符合监管要求。
- 无匿名发帖字段，后端也不接受匿名参数。

## 开发

```bash
npm run lint
npm run type-check
npm test
```
