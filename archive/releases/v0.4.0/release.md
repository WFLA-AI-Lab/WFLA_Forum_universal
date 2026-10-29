# v0.4.0 发布记录

- 发布日期：2026-10-25
- Git tag：`v0.4.0`
- Commit：`3d6af33efd38c41d2a3f5e5f49e076265a309283`
- API：`v1`
- 数据库 schema：`12`
- 皮肤契约：`2`

## 本次发布摘要

新增分级邀请码：邀请码可指定注册后的目标角色（成员 / 监管者 / 管理员），旧邀请码自动视为成员邀请码；邀请码列表显示目标角色。权限边界收紧为「任何人都不能生成或激活同级及以上权限的账号」，管理员邀请码只能由 owner 发放与激活；邀请码角色写入数据库并由服务端强制校验，不能靠改前端绕过。账号详情支持即时变更角色，下一次请求即按新权限判定。

## 数据库迁移

本次包含 1 个新迁移，invitations gain a target role (member / moderator / admin); schema_version 11 -> 12：

- `0012_invitation_roles.sql`

## 校验

发版当时的检查输出没有留存，因此 `release.json` 的 `checks` 记为 `[]`，不事后编造结论。
版本、契约与迁移信息均直接取自本 tag 指向的提交及其 `src/version.ts`、`src/migrations/` 与 `docs/CHANGELOG.md`。

## 归档约束

本目录只记录发布元数据，不包含 `.env`、密钥、数据库、备份、证书或个人信息。已发布版本的归档文件视为不可变记录；如需勘误，新增说明而不是改写历史。

## 回滚

代码可回到 `v0.3.1`。restore the pre-v0.4.0 backup; migration 0012 is forward-only。

数据库备份记录：`backups/pre-v0.4.0-invite-roles-20261025T122931Z`（`backups/` 不入库）。pre-release snapshot taken before the role-bearing invitation migration。

## 归档补录说明

本记录于 2026-10-29 事后补录（tag 与提交时间见上）。依据：retrospective backfill from the git tag, its target commit and that commit’s src/version.ts + docs/CHANGELOG.md。
