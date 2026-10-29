# v0.3.1 发布记录

- 发布日期：2026-10-25
- Git tag：`v0.3.1`
- Commit：`1a77bb5a23f432bfc9e41bb1e3f030b4799c03ae`
- API：`v1`
- 数据库 schema：`11`
- 皮肤契约：`2`

## 本次发布摘要

上线全屏独立管理后台（仅 `admin` / `owner`），与论坛皮肤解耦：概览统计、账号管理、内容与举报队列、邀请码管理、公告与板块、审计日志，以及 owner 专属外观 / 高级设置 / 系统诊断（`0010_admin_console.sql`）。用户昵称与头像资料、皮肤契约 v2 随本 tag 发布（`0009_user_profiles.sql`）。同时把身份字段 `graduation_year` / `graduationYear` 全量更名为 `enrollment_year` / `enrollmentYear`，语义明确为入学年份，并保留全部账号数据（`0011_enrollment_year.sql`）。

注意：仓库中没有 `v0.3.0` 标签，`docs/CHANGELOG.md` 的 0.3.0 一节（独立管理后台）实际随本 tag 一起发布。

## 数据库迁移

本次包含 3 个新迁移，user profiles + independent admin console + graduation_year renamed to enrollment_year; schema_version 8 -> 11：

- `0009_user_profiles.sql`
- `0010_admin_console.sql`
- `0011_enrollment_year.sql`

## 校验

发版当时的检查输出没有留存，因此 `release.json` 的 `checks` 记为 `[]`，不事后编造结论。
版本、契约与迁移信息均直接取自本 tag 指向的提交及其 `src/version.ts`、`src/migrations/` 与 `docs/CHANGELOG.md`。

## 归档约束

本目录只记录发布元数据，不包含 `.env`、密钥、数据库、备份、证书或个人信息。已发布版本的归档文件视为不可变记录；如需勘误，新增说明而不是改写历史。

## 回滚

代码可回到 `v0.2.0`。restore the pre-v0.3.x backup; migrations 0009-0011 are forward-only (0011 renames a column)。

数据库备份记录：`backups/pre-v0.3.0-admin-2026-10-25T18-47-47Z`（`backups/` 不入库）。pre-release snapshot from the admin console work that shipped as v0.3.1。

## 归档补录说明

本记录于 2026-10-29 事后补录（tag 与提交时间见上）。依据：retrospective backfill from the git tag, its target commit and that commit’s src/version.ts + docs/CHANGELOG.md。
