# v0.4.2 发布记录

- 发布日期：2026-10-25
- Git tag：`v0.4.2`
- Commit：`2f8a0104f3d8995b796ab3957e1a3a082cf15025`
- API：`v1`
- 数据库 schema：`12`
- 皮肤契约：`2`

## 本次发布摘要

修复注册与接口参数校验失败表现为不透明 `500` 的问题：`onError` 现在识别 `ZodError` 并返回 `422 VALIDATION_ERROR`，带上首个错误的可读中文信息与逐字段 `path` / `message`。入学年份校验改为 `z.coerce.string().trim()`，同时接受字符串与 JSON 数字，并给出「入学年份必须为四位数字，例如 2026」的提示。

注意：`docs/CHANGELOG.md` 此前没有 0.4.2 一节，本次补记。

## 数据库迁移

本次无数据库迁移，schema 保持 `12`。

## 校验

发版当时的检查输出没有留存，因此 `release.json` 的 `checks` 记为 `[]`，不事后编造结论。
版本、契约与迁移信息均直接取自本 tag 指向的提交及其 `src/version.ts`、`src/migrations/` 与 `docs/CHANGELOG.md`。

## 归档约束

本目录只记录发布元数据，不包含 `.env`、密钥、数据库、备份、证书或个人信息。已发布版本的归档文件视为不可变记录；如需勘误，新增说明而不是改写历史。

## 回滚

代码可回到 `v0.4.1`。no schema change; no database rollback required。

数据库备份记录：`backups/pre-v0.4.2-register-validation-20261025T231250Z`（`backups/` 不入库）。pre-release snapshot taken before the registration validation patch。

## 归档补录说明

本记录于 2026-10-29 事后补录（tag 与提交时间见上）。依据：retrospective backfill from the git tag, its target commit and that commit’s src/version.ts + docs/CHANGELOG.md。
