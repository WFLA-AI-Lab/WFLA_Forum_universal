# v0.9.0 发布记录

- 发布日期：2026-10-27
- Git tag：`v0.9.0`
- Commit：`4a41e93834ebaa27fc0685082753b33d381c7d56`
- API：`v1`
- 数据库 schema：`14`
- 皮肤契约：`3`

## 本次发布摘要

新增自托管私聊：唯一会话、文本消息、幂等发送、历史分页、5 秒轮询所需的增量接口、未读数、标记已读、屏蔽与本人删除 tombstone。新增管理员维护的群聊：群创建 / 更新 / 软删除、成员添加 / 移除、用户退出与重新加入、群消息历史与后台消息查看。举报支持 `target_type = message`，监管者可查看被举报消息及上下文并写审计日志。聊天自动监管在命中敏感词、链接密度、重复内容与洪水规则时记录风险事件并通知监管者，但不自动隐藏聊天消息。新增 `docs/CHAT_API.md` 与 `/#/chat-test` 临时验收页。

明确范围：仅验收 Node.js + SQLite 自托管部署；聊天 v1 不支持附件、回复、转发、搜索、编辑、typing、在线状态、已读回执与用户自建群。

## 数据库迁移

本次包含 1 个新迁移，private chat, admin-managed group chat and message reports; schema_version 13 -> 14：

- `0014_chat.sql`

## 校验

发版当时的检查输出没有留存，因此 `release.json` 的 `checks` 记为 `[]`，不事后编造结论。
版本、契约与迁移信息均直接取自本 tag 指向的提交及其 `src/version.ts`、`src/migrations/` 与 `docs/CHANGELOG.md`。

## 归档约束

本目录只记录发布元数据，不包含 `.env`、密钥、数据库、备份、证书或个人信息。已发布版本的归档文件视为不可变记录；如需勘误，新增说明而不是改写历史。

## 回滚

代码可回到 `v0.8.0`。restore the pre-v0.9.0 backup; migration 0014 is forward-only。

数据库备份记录：`backups/wfla-wall-2026-10-27T14-45-22Z.sqlite`（`backups/` 不入库）。pre-release snapshot taken immediately before the v0.9.0 release commit。

## 归档补录说明

本记录于 2026-10-29 事后补录（tag 与提交时间见上）。依据：retrospective backfill from the git tag, its target commit and that commit’s src/version.ts + docs/CHANGELOG.md。
