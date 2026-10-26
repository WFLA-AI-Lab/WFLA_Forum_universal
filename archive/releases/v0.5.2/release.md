# v0.5.2 发布记录

- 发布日期：2026-10-26
- Git tag：`v0.5.2`
- Commit：`acac788`
- API：`v1`
- 数据库 schema：`13`
- 皮肤契约：`2`

## 本次发布摘要

修复自托管静态资源缺失时错误回退为 HTML，补齐懒加载 X 皮肤 chunk，并让 `frontend/dist → public` 同步采用完整替换，避免开屏动画后白屏。

## 校验

已完成后端 type-check、lint、测试，以及前端 type-check、build。数据库迁移 `0013_moderation_automation.sql` 已在发布环境应用到 schema 13。

## 回滚

代码可回到 `v0.5.1`。数据库迁移是单向的：不要自动回滚数据库，优先使用经过验证的备份或向前修复迁移。