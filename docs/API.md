# WFLA Wall API 接口文档

> 适用版本：**v0.11.1** ｜ API 版本：**v1** ｜ 皮肤契约：**4** ｜ 数据库结构：**17**

本文件是给前端 / 移动端 / 第三方集成开发者看的接口契约。所有接口都挂在基础路径
`/api/v1` 之下；若站点公开地址是 `https://wflawall.zh.kg`，则完整地址是
`https://wflawall.zh.kg/api/v1/...`。

- 认证方式：**HttpOnly Cookie 会话**（同源请求自动带上，无需手动传 token）。
- 所有请求/响应体都是 JSON（`Content-Type: application/json`）。
- 时间统一使用 ISO-8601 UTC 字符串，例如 `2026-10-25T04:00:00.000Z`。
- 中文姓名与入学届别对所有人公开；本论坛**没有匿名发帖**。

---

## 1. 约定

### 1.1 角色（role）

| 角色 | 说明 | 权限等级 |
| --- | --- | --- |
| `guest` | 未登录访客（不是数据库角色，仅用于表达） | 0 |
| `member` | 普通成员 | 1 |
| `moderator` | 监管者（版主） | 2 |
| `admin` | 管理员 | 3 |
| `owner` | 论坛所有者（唯一最高权限） | 4 |

权限判定使用「大于等于」语义：需要 `moderator` 的接口，`admin` / `owner` 同样可以调用。

### 1.2 账号状态（status）

`pending`（邀请注册后待管理员激活）｜`active`（正常）｜`muted`（禁言）｜
`banned`（封禁，会话立即失效）｜`deleted`（软删除）。

**只有 `active` 用户可以发帖、回复、互动。** 游客始终可以浏览公开内容（除非站点关闭游客只读）。

### 1.3 错误响应

失败时返回统一的错误结构：

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "需要 admin 或更高权限",
    "details": null
  }
}
```

| code | HTTP | 含义 |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | 参数缺失或格式非法 |
| `VALIDATION_ERROR` | 422 | Zod 校验失败 |
| `UNAUTHORIZED` | 401 | 未登录或会话失效 |
| `FORBIDDEN` | 403 | 已登录但权限不足 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `CONFLICT` | 409 | 冲突（如 slug 重复、话题已锁定） |
| `RATE_LIMITED` | 429 | 触发限流（如登录） |
| `UPSTREAM_ERROR` | 502 | 第三方服务（OAuth）异常 |
| `INTERNAL_ERROR` | 500 | 未预期的服务器错误 |

---

## 2. 站点与健康检查

### `GET /health`

无需认证。用于负载均衡 / 内网穿透健康检查。

```json
{
  "status": "ok",
  "time": "2026-10-25T04:00:00.000Z",
  "version": "0.11.1",
  "api_version": "v1",
  "schema_version": 17
}
```

### `GET /site/config`

无需认证，**可公开缓存**（`Cache-Control: public, max-age=30`）。客户端启动时读取的品牌、版本与皮肤清单。

```json
{
  "forum_name": "世外墙 WFLA Wall",
  "tagline": "世外中学校园论坛",
  "version": "0.11.1",
  "api_version": "v1",
  "skin_contract_version": 4,
  "default_skin": "x",
  "skins": [
    { "id": "x", "name": "WFLA X", "description": "...", "status": "stable" }
  ],
  "guest_read_enabled": true,
  "registration_enabled": true,
  "skin_registry": [ /* 编译期全部皮肤，含未启用项 */ ]
}
```

> 前端应把 `skin_contract_version` 与自身支持的契约版本比对；不一致时至少要能降级渲染。

### `GET /auth/providers`

无需认证。告知客户端当前部署启用了哪些第三方登录。

```json
{ "forum_name": "世外墙 WFLA Wall", "microsoft": false, "github": true }
```

---

## 3. 身份与账号

### `POST /login`

无需认证，受限流保护（按 IP）。成功后会 `Set-Cookie` 写入会话 Cookie。

请求：

```json
{ "username": "20260001", "password": "**********" }
```

`username` 接受新注册用户的八位学号，也兼容既有账号的用户名。

响应 `200`：

```json
{
  "user": {
    "id": "…", "username": "student01", "real_name": "张三",
    "enrollment_year": "2026", "role": "owner", "status": "active",
    "created_at": "…", "updated_at": "…"
  }
}
```

`pending` 用户可登录但 `status` 为 `pending`，此时不能发帖；`banned` / `deleted` 用户登录被拒绝。

### `POST /logout`

需要登录。删除当前会话并清除 Cookie。

```json
{ "success": true }
```

### `GET /me`

需要登录。返回当前登录用户。

```json
{ "user": { "id": "…", "username": "…", "real_name": "…", "enrollment_year": "2026", "role": "member", "status": "active" } }
```

### `PATCH /users/:id`

需要登录。本人可改自己的资料；`admin` 及以上可改任意人。

请求（两个字段至少填一个）：

```json
{ "real_name": "张三", "enrollment_year": "2026" }
```

- `real_name`：2–10 个中文字符。
- `enrollment_year`：`20xx`，本论坛约定为**入学年份**（2026 届 = 2026 年入学）。

### `POST /users/:id/password`

需要登录。本人或 `admin` 及以上。修改后该用户所有会话会被撤销。

```json
{ "password": "NewPassw0rd!" }
```

密码规则：≥10 位，且同时含小写、大写、数字、符号。

### `GET /users/:id`

无需认证。返回公开资料（**不含** username / 邮箱等）。

### 第三方登录（OAuth）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/auth/github/login` | 跳转 GitHub 授权，回调后建立会话 |
| GET | `/auth/github/link` | 需登录，把 GitHub 身份绑定到当前账号 |
| GET | `/auth/github/callback` | GitHub 回调（GitHub 后台填写此地址） |
| GET | `/auth/microsoft/login` | 跳转 Microsoft 授权 |
| GET | `/auth/microsoft/link` | 需登录，绑定 Microsoft 身份 |
| GET | `/auth/microsoft/callback` | Microsoft 回调 |

说明：

- 支持 `?return_to=/path` 指定回调后跳回的前端路径。
- **第三方身份必须先绑定**到某个论坛账号才能用于登录；未绑定的第三方账号登录会失败并提示。
- 回调地址必须是 `<站点公开地址>/api/v1/auth/<provider>/callback`，且与站点公开地址同源。

### `GET /me/preferences`

需要登录。返回当前用户的个人偏好记录。此接口**只读写当前登录用户自己的偏好**，
不存在跨用户读写。

响应 200：

```json
{ "preferences": { "skin_id": "x", "updated_at": "…" } }
```

`skin_id` 为 `null` 表示该用户从未保存过皮肤偏好。

### `PUT /me/preferences/skin`

需要登录。把当前用户选择的界面皮肤保存到账号（区别于浏览器本地缓存）。
重复提交同一皮肤是幂等的。

请求：

```json
{ "skin_id": "x" }
```

### `GET /me/profile` / `PATCH /me/profile`

需要登录。读取或更新当前账号自己的展示资料；真实姓名和届别仍来自实名信息，不能通过此接口覆盖。

```json
{
  "nickname": "Campus Tester",
  "avatar_data_url": "data:image/png;base64,..."
}
```

- 昵称为 1–24 个中英文字符、数字或常用符号。
- 头像支持 PNG / JPEG / WebP，经前端限制在 256KB 内；传 `null` 可移除头像。
- 首次读取且尚未设置资料时，昵称默认使用真实姓名。

响应 200：

```json
{ "preference": { "skin_id": "x" } }
```

错误：

- 400 BAD_REQUEST：皮肤不存在、未被本站启用，或请求体格式无效。
- 401 UNAUTHORIZED：未登录。

> 前端策略：游客固定使用 X 皮肤；登录后读取账号偏好。登录用户切换布局时
> 立即生效并写入浏览器 localStorage，同时调用本接口同步到账号。

### `GET /me/preferences/effective-skin`

需要登录。返回当前用户生效的皮肤：已保存偏好，否则回退站点默认皮肤
（可用 ?default=<id> 指定回退值，仅限已注册皮肤）。

响应 200：

```json
{ "skin_id": "x" }
```
---

## 4. 管理后台（v0.5.0）

以下接口均要求 `admin` 或 `owner`；`/admin/settings`、`/admin/site-config` 与 `/admin/diagnostics` 仅 `owner` 可访问。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/overview` | 账号、内容、举报、邀请统计、14 天趋势、提醒与热门话题 |
| GET | `/admin/users` | 账号列表，支持 `query`、`role`、`status`、`limit`、`offset` |
| GET | `/admin/users/:id` | 账号详情、第三方绑定、备注、处置历史与内容计数 |
| POST | `/admin/users/:id/notes` | 添加管理备注；body `{ "body": "..." }` |
| POST | `/admin/users/:id/sessions/revoke` | 撤销该账号全部会话 |
| GET | `/admin/content` | 内容审核列表，支持 `type=threads|posts`、`status`、`query` |
| GET | `/admin/audit` | 审计日志，支持 `action`、`query`、`limit`、`offset` |
| GET | `/admin/announcements` | 管理端公告列表（含已结束公告） |
| DELETE | `/admin/announcements/:id` | 删除公告并写审计日志 |

管理员只能创建、管理、授权或激活权限严格低于自己的账号；不能操作同级、更高权限或自己。
`/users/:id/password` 重置密码后撤销目标用户全部会话，并写 `user.password_reset` 审计记录。

---

## 5. 邀请制注册

### `POST /register`

无需认证。使用邀请码自助注册，**注册后状态为 `pending`，必须由管理员在后台手动激活**。

请求：

```json
{
  "invitation_code": "32位小写十六进制",
  "student_number": "20260001",
  "password": "Passw0rd!!",
  "real_name": "张三",
  "nickname": "小张",
  "avatar_data_url": "data:image/png;base64,..."
}
```

- `student_number`：8 位数字，前 4 位为入学年份；可作为登录凭证且全站唯一，但不会充当公开用户名。
- `nickname`：1–24 个中英文字符、数字或常用符号。
- `avatar_data_url`：必填，支持 PNG / JPEG / WebP，处理后不超过 256KB。
- 学号不会进入公开用户资料；公开展示仍使用真实姓名、入学年份、昵称和头像。

响应 `201`：

```json
{ "item": { "id": "…", "username": "wfla_…", "student_number": "20260001", "real_name": "张三", "enrollment_year": "2026", "nickname": "小张", "avatar_data_url": "data:image/png;base64,...", "role": "member", "status": "pending" } }
```

### `POST /invitations` — 需要 `admin`

生成邀请码。请求（可选）：

```json
{ "ttl_hours": 168, "role": "moderator" }
```

`role` ∈ `member | moderator | admin`，默认 `member`。owner 可发放管理员邀请码；admin/owner 可发放监管者或成员邀请码；不能发放同级或更高权限邀请码。


`ttl_hours` 取值 1–720（最长 30 天），默认 168 小时（7 天）。

### `GET /invitations` — 需要 `admin`

列出最近 200 条邀请码及其使用情况。

### `POST /users/:id/activate` — 需要 `admin`

把 `pending` 用户激活为 `active`。写审计日志。

---

## 6. 板块与内容

### `GET /feed`

跨板块公开时间线。`?limit=1..50`（默认 20）和可选 `?cursor=<上一页 next_cursor>`；只返回活跃板块的已发布话题，按创建时间倒序。响应含 `items` 与 `next_cursor`，每个话题附带 `board: { slug, name }` 和首帖净化后的 `preview_html`。

### `GET /boards`

无需认证。列出所有启用板块（按 `position`、`name` 排序）。

### `POST /boards` — 需要 `admin`

```json
{ "name": "校园生活", "slug": "campus-life", "description": "…", "position": 0 }
```

`slug` 必须是 2–40 位小写字母 / 数字 / 连字符，且全局唯一。

### `GET /boards/:slug/threads`

无需认证。分页列出某板块下已发布话题。

Query：`limit`（1–50，默认 20）、`cursor`（上一页返回的 `next_cursor`）。

```json
{
  "items": [
    {
      "id": "…", "board_id": "…", "title": "…", "slug": "…",
      "status": "published", "is_pinned": false, "view_count": 12, "reply_count": 3,
      "last_activity_at": "…", "created_at": "…", "updated_at": "…",
      "author": { "id": "…", "username": "…", "real_name": "…", "enrollment_year": "2026", "role": "member" }
    }
  ],
  "next_cursor": "…"
}
```

### `POST /boards/:slug/threads` — 需要登录且 `active`

```json
{ "title": "话题标题", "content": "Markdown 正文" }
```

`title` 2–120 字；`content` 1–10000 字，服务端会渲染为白名单 HTML 存入 `content_html`。

### `GET /threads/:id`

无需认证。返回话题本身 + 最多 200 条未删除回复（按楼层升序）。

### `POST /threads/:id/posts` — 需要登录且 `active`

```json
{ "content": "回复正文", "parent_post_id": "可选的被回复帖子 id" }
```

话题 `locked` 时拒绝；`hidden` / `deleted` 时不可回复。回复成功会给话题作者发送通知。

### `PATCH /posts/:id`

需要登录。作者本人或 `admin` 及以上。请求 `{ "content": "新正文" }`，`edit_count` 自增。

### `DELETE /posts/:id`

需要登录。作者本人或 `admin` 及以上。软删除（`status = deleted`）。

### `POST /threads/:id/view`

无需认证。浏览量 +1（用于前端去重后调用）。

---

## 7. 互动

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| PUT | `/threads/:id/bookmark` | 登录 | 收藏（幂等） |
| DELETE | `/threads/:id/bookmark` | 登录 | 取消收藏 |
| GET | `/bookmarks` | 登录 | 我的收藏，最多 100 条 |
| PUT | `/reactions` | 登录且 `active` | 点赞/点踩（切换语义） |
| DELETE | `/reactions` | 登录 | 取消反应 |
| GET | `/search?q=` | 无需认证 | 搜索话题 / 回复 / 用户 |

`PUT /reactions` 请求：

```json
{ "target_type": "thread", "target_id": "…", "reaction": "like" }
```

`target_type` ∈ `thread | post`；`reaction` ∈ `like | dislike`。响应返回最新计数：

```json
{ "likes": 5, "dislikes": 1 }
```

`DELETE /reactions?target_type=thread&target_id=…` 取消。

`GET /search` 的 `q` 为 1–100 字符，返回：

```json
{ "threads": [], "posts": [], "users": [] }
```

---

## 8. 公告与通知

### `GET /announcements`

无需认证。返回**当前生效中**的公告（`starts_at <= now < ends_at`），按级别（urgent → important → normal）与时间排序。

> 公告 = 全论坛所有访客与成员都能看到的最显眼全站横幅（例如版本维护、紧急通知），
> 也可以承载面向全体成员的社团 / 活动信息。它不是「单个社团的内部公告」；
> 定向 / 分范围公告属于后续规划。

### `POST /announcements` — 需要 `admin`

```json
{ "title": "…", "content": "…", "level": "important", "starts_at": "2026-10-25T00:00:00Z", "ends_at": "2026-10-30T00:00:00Z" }
```

- `level` ∈ `normal | important | urgent`（默认 `normal`）。
- `starts_at` 默认当前时间；`ends_at` 可选，但必须晚于 `starts_at`。
- 发布后会给**所有 `active` 用户**插入站内通知。

### `GET /notifications`

需要登录。返回本人最近 100 条通知。

### `POST /notifications/read-all`

需要登录。把本人所有通知标记已读。

### `POST /notifications/:id/read`

需要登录。把指定通知标记已读（仅限本人的通知）。

---

## 9. 举报与监管

### `POST /reports` — 需要登录

```json
{ "target_type": "post", "target_id": "…", "reason": "垃圾广告", "details": "补充说明" }
```

`target_type` ∈ `thread | post | user`；`reason` 2–100 字；`details` 最多 1000 字。
提交后会给**所有在岗监管者**（`moderator` / `admin` / `owner`）发送通知。

### `GET /reports/:id` — 需要 `moderator`
返回举报详情和完整上下文：举报人身份、被举报用户身份，或被举报话题/回复及其作者身份。监管者不需要再拼接多个接口。
### `GET /reports` — 需要 `moderator`

Query `status` ∈ `open | in_review | resolved | rejected`，可选。按待处理优先排序，最多 100 条。

### `POST /reports/:id/resolve` — 需要 `moderator`

```json
{ "resolution": "已删除违规内容并警告作者" }
```

### `POST /reports/:id/reject` — 需要 `moderator`

```json
{ "reason": "经核查不构成违规" }
```

### `POST /reports/:id/assign` — 需要 `moderator`

```json
{ "assigned_to": "监管者用户 id" }
```

### `PATCH /threads/:id/status` — 需要 `moderator`

```json
{ "status": "hidden", "reason": "含人身攻击内容" }
```

`status` ∈ `published | hidden | locked`；`reason` 必填（≥2 字）。写审计日志。

### `PATCH /posts/:id/status` — 需要 `moderator`

```json
{ "status": "hidden", "reason": "…" }
```

`status` ∈ `published | hidden`。

### `GET /moderation/rules` — 需要 `moderator`
返回五条自动监管规则：举报阈值、高风险词、高链接密度、重复灌水、新用户高频发布。
### `PATCH /moderation/rules/:id` — 需要 `admin`
```json
{ "enabled": true, "threshold": 3 }
```
写审计日志。当前版本阈值表示：举报人数、链接数量、重复次数或单位时间发布量。
### `GET /moderation/risks` — 需要 `moderator`
返回自动监管生成的风险事件。
### `POST /moderation/risks/:id/dismiss` — 需要 `moderator`
```json
{ "reason": "人工复核后确认不违规" }
```
### `POST /appeals` — 需要登录且账号处于 `muted` 或 `banned`
```json
{ "reason": "我认为处罚不符合事实，申请复核" }
```
### `GET /appeals` — 需要 `moderator`
### `POST /appeals/:id/approve` / `POST /appeals/:id/reject` — 需要 `moderator`
通过申诉会恢复账号并记录一条 `restore` 处置；两种结果都会通知用户并写审计日志。
### `GET /audit-logs` — 需要 `admin`

返回最近 200 条审计记录，覆盖邀请、用户状态 / 角色变更、监管操作、公告、站点配置等。

---

## 10. 用户管理（管理后台）

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/users` | `moderator` | 用户列表，最多 300 条 |
| POST | `/users` | `admin` | 直接创建账号（内测分发 / 应急用） |
| POST | `/users/:id/role` | `admin` | 调整角色 |
| POST | `/users/:id/status` | `moderator` | 调整状态（禁言 / 封禁等） |

`POST /users/:id/role`：

```json
{ "role": "moderator", "reason": "…" }
```

- 仅 `owner` 可把他人设为 `admin` 级别以上；`admin` 不能操作同级或更高权限者。
- 设 `banned` 会立即删除该用户全部会话。

`POST /users/:id/status`：

```json
{ "status": "muted", "reason": "…" }
```

`status` ∈ `active | muted | banned | pending`。

---

## 11. 站点外观与运行时设置（仅 `owner`）

### `GET /admin/site-config`

返回当前站点配置 + 编译期全部皮肤。

### `PATCH /admin/site-config`

修改默认皮肤、皮肤白名单与注册 / 游客策略。**保存后立即生效，无需重启。**

```json
{
  "default_skin": "x",
  "allowed_skins": ["x"],
  "guest_read_enabled": true,
  "registration_enabled": true,
  "site_tagline": "世外中学校园论坛"
}
```

- 字段均可选，但至少填一个，否则报 `没有检测到需要保存的修改`。
- `default_skin` 会被强制落在 `allowed_skins` 之内；未知皮肤 id 会被丢弃。
- 请求体 `.strict()`，多余字段直接报错。

### `GET /admin/settings`

返回可公开的运行时设置（敏感字段只返回 `*_configured` 布尔值，**绝不回显密钥**）。

### `PATCH /admin/settings`

修改站点公开地址、会话参数与 GitHub / Microsoft OAuth 配置。**必须带 owner 当前密码二次确认。**

```json
{
  "forum_name": "世外墙 WFLA Wall",
  "public_origin": "https://wflawall.zh.kg",
  "session_ttl_seconds": 604800,
  "cookie_secure": true,
  "cookie_samesite": "Lax",
  "trust_proxy_headers": true,
  "github_client_id": "…",
  "github_redirect_uri": "https://wflawall.zh.kg/api/v1/auth/github/callback",
  "github_client_secret": "仅在需要更新时填写",
  "clear_github_client_secret": false,
  "microsoft_client_id": "",
  "microsoft_redirect_uri": "",
  "confirm_password": "owner 当前密码"
}
```

校验规则：

- `public_origin` 必须是 `http(s)` 的纯 origin（不能带路径 / 查询 / 锚点）。
- `*_redirect_uri` 路径必须正好是 `/api/v1/auth/<provider>/callback`，且与 `public_origin` 同源。
- 回调地址与对应 `client_id` 必须**同时填写或同时留空**。
- 该接口按用户 id 限流。

### `GET /admin/diagnostics` — 仅 `owner`

主动探测 GitHub / Microsoft 端点连通性，返回每个端点的 `ok` / `status` / `latency_ms` / `error`，
并在失败时给出排查提示。用于排查 OAuth 走不通的问题。

---

## 12. 变更与兼容策略

- 路径带 `/api/v1`：**破坏性变更必须升 `API_VERSION`**，并新增 `/api/v2` 而不是原地改 v1。
- 响应对象新增字段是兼容变更，客户端必须忽略未知字段。
- 撤下字段 / 修改字段类型 = 破坏性变更。
- 皮肤契约见 [`FRONTEND_SKIN_GUIDE.md`](./FRONTEND_SKIN_GUIDE.md)，与 API 版本独立演进。

\n
