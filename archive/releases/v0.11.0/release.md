# v0.11.0 发布记录

- 发布日期：2026-10-29
- Git tag：`v0.11.0`
- Commit：`35d42b6a5ad2107a176bdf5c8fe641ec932543a5`
- API：`v1`
- 数据库 schema：`17`
- 皮肤契约：`4`

## 本次发布摘要

合并 Zx_ 的 PR #14 / #15 / #16：

- 新增可选 Claude UI 皮肤（皮肤契约升至 4）。
- 新增 QQ 风格用户群聊与完整群管理（群主转让、管理员任免、成员邀请/移除、群昵称、退群与解散）。
- 重做注册页，采集校园实名身份资料（真实姓名、八位学号、昵称、头像），学号作为非公开登录凭证。

## 数据库迁移

本次包含三个新迁移，schema 从 `14` 升至 `17`：

- `0015_claude_skin.sql`
- `0016_group_chat_management.sql`
- `0017_student_registration_profile.sql`

已在本地执行并核对 `/api/v1/health` 返回 `schema_version=17`。

## 校验

- 后端 type-check / lint
- 前端 type-check / build
- 自托管迁移至 schema 17
- 一键启动端到端构建、同步与重启
- `/api/v1/health` 与 `/api/v1/site/config` HTTP 校验

## 归档约束

本目录只记录发布元数据，不包含 `.env`、密钥、数据库、备份、证书或个人信息。已发布版本的归档文件视为不可变记录；如需勘误，新增说明而不是改写历史。

## 回滚

代码可回到 `v0.10.0`。数据库迁移为单向，回滚需恢复迁移前备份 `backups/wfla-wall-2026-10-29T12-03-28Z.sqlite`；不要删除已执行的迁移文件。