# v0.8.0 发布记录

- 发布日期：2026-10-27
- Git tag：`v0.8.0`
- Commit：`e16d019a5789b8afe81e5726ad257ee3aa6a5f4c`
- API：`v1`
- 数据库 schema：`13`
- 皮肤契约：`3`

## 本次发布摘要

新增自托管按天运行日志：写入 `logs/wfla-YYYY-MM-DD.jsonl`，记录启动、请求、5xx、未捕获异常与未处理 Promise，日志目录与保留天数可由 `.env` 配置（默认 14 天）。帖子列表 / 详情 / 收藏 / 搜索结果返回并显示点赞数。修复管理后台「举报上下文」样式缺失（`.adm-context`、处理说明输入框与操作按钮）以及举报详情加载失败产生未处理 Promise 的问题。一键启动默认重新构建前端，避免 `public/` 残留旧产物（`-NoBuild` 可复用）。

## 数据库迁移

本次无数据库迁移，schema 保持 `13`。

## 校验

发版当时的检查输出没有留存，因此 `release.json` 的 `checks` 记为 `[]`，不事后编造结论。
版本、契约与迁移信息均直接取自本 tag 指向的提交及其 `src/version.ts`、`src/migrations/` 与 `docs/CHANGELOG.md`。

## 归档约束

本目录只记录发布元数据，不包含 `.env`、密钥、数据库、备份、证书或个人信息。已发布版本的归档文件视为不可变记录；如需勘误，新增说明而不是改写历史。

## 回滚

代码可回到 `v0.7.0`。no schema change; no database rollback required。

数据库备份记录：`backups/wfla-wall-2026-10-27T14-28-24Z.sqlite`（`backups/` 不入库）。retained snapshot from the v0.8.0 release window; the original backup purpose was not recorded at the time。

## 归档补录说明

本记录于 2026-10-29 事后补录（tag 与提交时间见上）。依据：retrospective backfill from the git tag, its target commit and that commit’s src/version.ts + docs/CHANGELOG.md。
