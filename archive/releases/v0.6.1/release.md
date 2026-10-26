# v0.6.1 发布记录

- 发布日期：2026-10-26
- Git tag：`v0.6.1`
- Commit：`117c366e48ea40e8962b2c8cad60fc9d8e7ef908`
- API：`v1`
- 数据库 schema：`13`
- 皮肤契约：`2`

## 本次发布摘要

修复一键启动遇到旧 `src-backend` 残留进程时，SQLite 被重复占用并报 `disk I/O error` 的问题。启动脚本现在会清理明确的旧版残留进程，并在端口被占用时给出可操作提示。

## 校验

已完成后端 type-check、lint 与全量测试，前端 type-check、build，以及启动脚本 PowerShell 语法检查。数据库完整性检查为 `ok`，结构保持 schema 13，无需迁移。

## 回滚

代码可回到 `v0.6.0`。本次没有数据库结构变更。
