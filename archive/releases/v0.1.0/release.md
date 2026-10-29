# v0.1.0 发布记录

- 发布日期：2026-10-25
- Git tag：`v0.1.0`
- Commit：`c4f3a99d4db0f60f1b0479bb956231bd665f2b47`
- API：`v1`
- 数据库 schema：`7`
- 皮肤契约：`1`

## 本次发布摘要

首个可交接版本：邀请制注册（一次性邀请码 + 管理员手动激活）、内部账号密码 + 会话 Cookie、GitHub / Microsoft OAuth（登录与绑定）、`member`→`moderator`→`admin`→`owner` 权限模型、板块 / 话题 / 回复（Markdown 白名单净化）、点赞点踩 / 收藏 / 全局搜索、公告与站内通知、举报与监管、审计日志、owner 专属高级设置与网络诊断、`GET /api/v1/site/config` 与 `GET /api/v1/health`，以及 SQLite 自托管（迁移、备份、一键配置 / 一键启动、可选 Caddy HTTPS）。前端引入可插拔皮肤架构（Skin Contract v1）：`x` 为默认皮肤，`endfield` 为备选，皮肤按需懒加载。

## 数据库迁移

本次包含 7 个新迁移，first release: migrations 0001-0007 are introduced here, schema_version=7：

- `0001_init.sql`
- `0002_invitations_external_auth.sql`
- `0003_microsoft_oauth.sql`
- `0004_engagement.sql`
- `0005_oauth_providers.sql`
- `0006_app_settings.sql`
- `0007_site_settings.sql`

## 校验

发版当时的检查输出没有留存，因此 `release.json` 的 `checks` 记为 `[]`，不事后编造结论。
版本、契约与迁移信息均直接取自本 tag 指向的提交及其 `src/version.ts`、`src/migrations/` 与 `docs/CHANGELOG.md`。

## 归档约束

本目录只记录发布元数据，不包含 `.env`、密钥、数据库、备份、证书或个人信息。已发布版本的归档文件视为不可变记录；如需勘误，新增说明而不是改写历史。

## 回滚

代码可回到 `(无更早版本)`。restore from verified backup only; migrations 0001-0007 are forward-only。

数据库备份记录：`backups/wfla-wall-2026-10-24T16-14-22Z-prev0.1.0.sqlite`（`backups/` 不入库）。snapshot taken before the first release; filename records prev0.1.0。

## 归档补录说明

本记录于 2026-10-29 事后补录（tag 与提交时间见上）。依据：retrospective backfill from the git tag, its target commit and that commit’s src/version.ts + docs/CHANGELOG.md。
