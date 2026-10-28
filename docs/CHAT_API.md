# WFLA Wall Chat API（v0.10.0）

> 适用版本：`v0.10.0` ｜ API：`v1` ｜ Schema：`14`。本文档给 Zx_ 实现正式前端使用。
> 仅验收自托管 Node.js + SQLite；聊天实时方案为 HTTP 分页 + 5 秒增量轮询。

## 核心规则

- 登录与 Cookie 与现有 API 相同：HttpOnly session cookie。
- 所有接口从 session 判定当前用户；任何 body/query 中的用户 id 都只表示目标，不表示调用者。
- 私聊：active 用户可直接发起；无同意流程；被对方屏蔽后无法创建/发送。
- 群聊：仅站点 admin/owner 可创建和维护；群主只是展示责任人，不拥有特殊权限。
- 消息：纯文本 Markdown 渲染，1–2000 字；无附件/回复/转发/搜索/编辑。
- 用户删除自己的消息会变成 tombstone；服务端保留原始审计数据。
- 退出群后不能读取历史；管理员重新加入后恢复访问。
- 轮询：打开会话时先拉最新页，然后用 `after` 增量拉取，建议 5 秒。

## 数据对象

### Conversation

```json
{
  "id": "uuid",
  "type": "direct",
  "title": "张三",
  "description": null,
  "counterpart": {
    "id": "uuid",
    "username": "zhangsan",
    "real_name": "张三",
    "enrollment_year": "2026",
    "role": "member",
    "status": "active"
  },
  "owner": null,
  "last_message": {
    "id": "uuid",
    "conversation_id": "uuid",
    "sender_id": "uuid",
    "client_id": "client-1",
    "content_markdown": "你好",
    "content_html": "<p>你好</p>",
    "status": "published",
    "created_at": "2026-10-27T00:00:00.000Z",
    "deleted_at": null,
    "sender": { "id": "uuid", "username": "lisi", "real_name": "李四", "enrollment_year": "2026", "role": "member", "status": "active" }
  },
  "last_message_at": "2026-10-27T00:00:00.000Z",
  "unread_count": 1,
  "member": {
    "joined_at": "2026-10-27T00:00:00.000Z",
    "left_at": null,
    "last_read_message_id": null,
    "last_read_at": null
  },
  "created_at": "2026-10-27T00:00:00.000Z",
  "updated_at": "2026-10-27T00:00:00.000Z"
}
```

群聊中 `type` 为 `group`，`title` 来自 `name`，`counterpart` 为 `null`，`owner` 为用户摘要。

### Message

```json
{
  "id": "uuid",
  "conversation_id": "uuid",
  "sender_id": "uuid",
  "client_id": "client-1",
  "content_markdown": "你好 **WFLA**",
  "content_html": "你好 <b>WFLA</b>",
  "status": "published",
  "created_at": "2026-10-27T00:00:00.000Z",
  "deleted_at": null,
  "sender": { "id": "uuid", "username": "lisi", "real_name": "李四", "enrollment_year": "2026", "role": "member", "status": "active" }
}
```

删除后的消息仍返回 `status: "deleted"` 和 `deleted_at`，正文为删除占位。

## 用户端接口

### 发起 / 复用唯一私聊

`POST /api/v1/conversations/direct`

```json
{ "user_id": "target-user-id" }
```

- 新建返回 `201`，复用返回 `200`（当前实现两者都可能为 `201`，前端应以 item 为准，不依赖状态码区分）。
- 对自己发起：`422`；目标不存在：`404`；目标 deleted/banned：`400`；被目标屏蔽：`403`。

响应：

```json
{ "item": { "id": "conversation-id", "type": "direct", "...": "..." } }
```

### 会话列表

`GET /api/v1/conversations?limit=20&type=direct|group&cursor=<conversation_id>`

- `limit` 1–50；`type` 可省略。
- 按 `last_message_at` 降序，没有消息时按创建时间。
- 返回 `items` 与 `next_cursor`。前端可用 `unread_count` 汇总总未读。

### 会话详情

`GET /api/v1/conversations/:id`

返回当前用户视角的会话与未退出成员列表。非成员、已退出成员或已删除群返回 `403/404`。

### 消息历史

`GET /api/v1/conversations/:id/messages?limit=50`

- 默认最新页，服务端返回 **`created_at DESC, id DESC`**。
- `before=<message_id>`：继续向历史分页，返回 `next_cursor`。
- `after=<message_id>`：增量轮询，按时间 ASC 返回新消息，返回 `next_after`。
- `limit` 1–100。
- 响应还包含 `latest_message_id`、`latest_message_at`。

### 发送消息（幂等）

`POST /api/v1/conversations/:id/messages`

```json
{ "client_id": "unique-per-user-conversation", "content": "你好" }
```

- `client_id` 1–128 字符；同一调用者、同一会话内唯一，重复请求返回原消息。
- `content` 1–2000 字。
- muted/banned/deleted、非成员、已退出成员、被屏蔽发送者均拒绝。
- 自动监管命中时消息仍保持 published，只生成风险事件并通知监管者。

### 标记已读

`POST /api/v1/conversations/:id/read`

```json
{ "message_id": "latest-message-id" }
```

只能推进自己的已读位置；返回更新后的 conversation，前端刷新 unread。

### 退出群

`DELETE /api/v1/conversations/:id/membership`

仅群聊；私聊返回 `400`。退出后历史不可读，管理员重新加入后恢复。

### 删除自己的消息

`DELETE /api/v1/messages/:id`

返回 `{ "item": { "id": "...", "status": "deleted", "deleted_at": "..." } }`。重复删除返回成功。

### 屏蔽 / 取消屏蔽

`POST /api/v1/users/:id/block`

`DELETE /api/v1/users/:id/block`

只影响私聊，群聊继续按成员规则发送。不能屏蔽自己。

## 管理端接口

以下接口要求 active 用户；创建/修改/删除/成员维护要求 `admin` 或更高，群列表/详情/消息查看要求 `moderator` 或更高。

### 群管理

- `POST /admin/chat/groups`：`{ name, description, owner_user_id? }`，群名 2–80 字。
- `GET /admin/chat/groups`：群列表、成员总数、active 成员数、最后消息时间、责任人。
- `GET /admin/chat/groups/:id`：群资料和成员（含已退出记录），不含消息。
- `PATCH /admin/chat/groups/:id`：更新 `name` / `description` / `owner_user_id`。
- `DELETE /admin/chat/groups/:id`：软删除群，用户侧不可见，历史保留。
- `POST /admin/chat/groups/:id/members`：`{ user_id }`，仅 active 用户；重新加入会清除 `left_at`。
- `DELETE /admin/chat/groups/:id/members/:user_id`：设置 `left_at`，保留历史。
- `GET /admin/chat/users?q=...`：active 用户候选，搜索用户名/真实姓名，最多 100 条。

### 管理端群消息

`GET /admin/chat/groups/:id/messages?limit=50&before=<message_id>`

仅供监管/管理员查看群消息，每次访问写 `chat.admin_access` 审计。私聊没有管理端浏览接口。

## 举报消息

`POST /api/v1/reports`

```json
{ "target_type": "message", "target_id": "message-id", "reason": "违规消息", "details": "" }
```

- 举报者必须是该消息所在会话的有效成员。
- 管理员查看 `GET /api/v1/reports/:id` 时返回 `target_message` 与 `message_context`。
- 上下文为目标消息前后各最多 10 条；每次查看写审计日志。
- 报告阈值自动隐藏不作用于消息。

## 前端建议

1. 会话页首次加载：`GET /conversations?limit=50`；打开会话时请求最新消息并调用 `/read`。
2. 发送：前端生成稳定 `client_id`（例如 UUID 并保存在提交状态中），失败重试继续使用同一个值。
3. 轮询：每 5 秒用最新消息 id 调 `GET .../messages?after=<id>`；收到新消息后调用 `/read`。
4. 历史：向上滚动时使用 `before=next_cursor`，并反转服务端 DESC 数组以呈现场顺序。
5. 删除消息后，将本地消息替换为服务端 tombstone，不移除列表项。
6. 群管理后台 UI 由 Zx_设计；调用上述 admin API，不引入群主权限操作。

## 临时验收页

`GET /#/chat-test` 是刻意保留的简陋后端验收页面，不做正式视觉；正式前端完成后可移除。它支持会话列表、搜索用户、发起私聊、发送/删除/已读、屏蔽、举报和后台群创建/成员维护。
