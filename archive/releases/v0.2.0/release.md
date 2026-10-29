# v0.2.0 发布记录

- 发布日期：2026-10-25
- Git tag：`v0.2.0`
- Commit：`07abca562db7141b7fa86f41ec9e7a900019587a`
- API：`v1`
- 数据库 schema：`8`
- 皮肤契约：`1`

## 本次发布摘要

新增每账号皮肤偏好同步：游客固定 `x` 皮肤，登录后可在「设置 / 登录」统一入口中切换皮肤并持久化到账号；桌面端 X 导航改用与移动端一致的图标语言与选中状态。

注意：`docs/CHANGELOG.md` 的 0.2.0 条目还写到了 `0009_user_profiles.sql` 与皮肤契约 v2，但 `v0.2.0` tag 的代码树只到 schema 8 / 皮肤契约 1，那部分工作随 `v0.3.1` 才真正发布；本记录以 tag 实际内容为准。

## 数据库迁移

本次包含 1 个新迁移，adds user_preferences (per-account skin id); schema_version=8：

- `0008_user_preferences.sql`

## 校验

发版当时的检查输出没有留存，因此 `release.json` 的 `checks` 记为 `[]`，不事后编造结论。
版本、契约与迁移信息均直接取自本 tag 指向的提交及其 `src/version.ts`、`src/migrations/` 与 `docs/CHANGELOG.md`。

## 归档约束

本目录只记录发布元数据，不包含 `.env`、密钥、数据库、备份、证书或个人信息。已发布版本的归档文件视为不可变记录；如需勘误，新增说明而不是改写历史。

## 回滚

代码可回到 `v0.1.0`。restore from verified backup only; migration 0008 is forward-only。

数据库备份记录：`backups/wfla-wall-2026-10-25T00-50-26Z-pre-v0.2.0.sqlite`（`backups/` 不入库）。pre-release snapshot taken before the v0.2.0 migration。

## 归档补录说明

本记录于 2026-10-29 事后补录（tag 与提交时间见上）。依据：retrospective backfill from the git tag, its target commit and that commit’s src/version.ts + docs/CHANGELOG.md。
