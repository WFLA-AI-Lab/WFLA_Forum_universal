# v0.4.1 发布记录

- 发布日期：2026-10-25
- Git tag：`v0.4.1`
- Commit：`d935c660e879cd9e43b595e1e31cb00d5f5718b9`
- API：`v1`
- 数据库 schema：`12`
- 皮肤契约：`2`

## 本次发布摘要

修复管理后台邀请码「复制」按钮在普通 HTTP 站点（非安全上下文）没有反应的问题：复制改为优先使用 Clipboard API，失败时回退到本地文本复制，浏览器完全禁用复制时弹出可手动复制的完整邀请码。同一问题在「复制初始密码 / 临时密码」上一起修掉，并在成功或失败时都给出明确反馈，不再静默失败。

## 数据库迁移

本次无数据库迁移，schema 保持 `12`。

## 校验

发版当时的检查输出没有留存，因此 `release.json` 的 `checks` 记为 `[]`，不事后编造结论。
版本、契约与迁移信息均直接取自本 tag 指向的提交及其 `src/version.ts`、`src/migrations/` 与 `docs/CHANGELOG.md`。

## 归档约束

本目录只记录发布元数据，不包含 `.env`、密钥、数据库、备份、证书或个人信息。已发布版本的归档文件视为不可变记录；如需勘误，新增说明而不是改写历史。

## 回滚

代码可回到 `v0.4.0`。no schema change; no database rollback required。

数据库备份记录：`backups/pre-v0.4.1-copy-fix-20261025T225807Z`（`backups/` 不入库）。pre-release snapshot taken before the copy-fix patch。

## 归档补录说明

本记录于 2026-10-29 事后补录（tag 与提交时间见上）。依据：retrospective backfill from the git tag, its target commit and that commit’s src/version.ts + docs/CHANGELOG.md。
