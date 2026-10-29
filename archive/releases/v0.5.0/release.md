# v0.5.0 发布记录

- 发布日期：2026-10-26
- Git tag：`v0.5.0`
- Commit：`38ddb70db28cbfcc279eb1dea846cdbadb09b947`
- API：`v1`
- 数据库 schema：`13`
- 皮肤契约：`2`

## 本次发布摘要

安全与审计补齐：待激活账号不再能密码登录、也不会因邀请码提议高角色而获得管理权限；所有权限检查统一要求账号 `active`；隐藏话题与隐藏回复对普通用户和游客彻底不可直达。监管者及以上可使用独立管理后台，举报详情补齐举报人 / 作者 / 真实姓名 / 届别与内容摘要，处理或驳回会通知举报人并写审计日志。新增自动监管规则（举报阈值、高风险词、链接密度、重复灌水、新用户高频发布）、风险事件与监管者通知、申诉接口与临时处罚到期自动恢复（含自动恢复审计）。举报提交增加服务端限流。补齐密码重置、编辑 / 删除回复、自动处置、申诉复核等审计缺口。

## 数据库迁移

本次包含 1 个新迁移，moderation_rules / risk_events / appeals + sanctions.resolved_at; schema_version 12 -> 13：

- `0013_moderation_automation.sql`

## 校验

发版当时的检查输出没有留存，因此 `release.json` 的 `checks` 记为 `[]`，不事后编造结论。
版本、契约与迁移信息均直接取自本 tag 指向的提交及其 `src/version.ts`、`src/migrations/` 与 `docs/CHANGELOG.md`。

## 归档约束

本目录只记录发布元数据，不包含 `.env`、密钥、数据库、备份、证书或个人信息。已发布版本的归档文件视为不可变记录；如需勘误，新增说明而不是改写历史。

## 回滚

代码可回到 `v0.4.2`。restore the pre-v0.5.0 backup; migration 0013 is forward-only。

数据库备份记录：`backups/pre-v0.5.0-moderation-20261026T001750Z`（`backups/` 不入库）。pre-release snapshot taken before the moderation-automation migration。

## 归档补录说明

本记录于 2026-10-29 事后补录（tag 与提交时间见上）。依据：retrospective backfill from the git tag, its target commit and that commit’s src/version.ts + docs/CHANGELOG.md。
