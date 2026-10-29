# v0.5.1 发布记录

- 发布日期：2026-10-26
- Git tag：`v0.5.1`
- Commit：`d61b8824b3325dba5e1220217167b67dcd749a06`
- API：`v1`
- 数据库 schema：`13`
- 皮肤契约：`2`

## 本次发布摘要

自托管脚本在 Windows 与 UNC 共享盘上的可靠性修复：迁移、建号、测试账号与备份脚本统一以脚本所在项目根目录解析 `.env`、数据库、迁移和备份路径，从任意当前目录运行都不会误写到本机仓库；一键配置脚本改为带 BOM 的 UTF-8，修复 PowerShell 5.1 直接运行中文脚本时的解析错误；一键配置默认复用已有前端构建产物（`-BuildFrontend` 可强制重编译，`-ReuseExisting` 用于无人值守），并修复共享包缺少前端 `node_modules` 时的误判。

## 数据库迁移

本次无数据库迁移，schema 保持 `13`。

## 校验

发版当时的检查输出没有留存，因此 `release.json` 的 `checks` 记为 `[]`，不事后编造结论。
版本、契约与迁移信息均直接取自本 tag 指向的提交及其 `src/version.ts`、`src/migrations/` 与 `docs/CHANGELOG.md`。

## 归档约束

本目录只记录发布元数据，不包含 `.env`、密钥、数据库、备份、证书或个人信息。已发布版本的归档文件视为不可变记录；如需勘误，新增说明而不是改写历史。

## 回滚

代码可回到 `v0.5.0`。no schema change; no database rollback required。

本版本没有留存专门的发布前备份；`backups/` 不入库，no dedicated pre-release snapshot for this patch was retained; backups/ is excluded from version control。

## 归档补录说明

本记录于 2026-10-29 事后补录（tag 与提交时间见上）。依据：retrospective backfill from the git tag, its target commit and that commit’s src/version.ts + docs/CHANGELOG.md。
