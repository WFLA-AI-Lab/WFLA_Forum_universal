# v0.11.1 发布记录

- 发布日期：2026-10-29
- Git tag：`v0.11.1`
- Commit：`294680a0a9480f6f69c20abbc39b12416e626d7e`
- API：`v1`
- 数据库 schema：`17`
- 皮肤契约：`4`

## 本次发布摘要

合并 Zx_ 的 PR #17：

- 修复创建群聊与群资料「邀请成员」的成员搜索框每输入一个字符就丢失焦点的问题。

## 变更说明

成员选择器原先以 `GroupUserPicker` 的形式声明在 `Community` 组件内部。父组件每次重渲染都会给这个嵌套组件分配新的组件身份，React 认为前后是两个不同的组件类型，于是卸载旧子树并挂载新子树，输入框随之重建，焦点与光标位置丢失。

改为内联渲染函数 `renderGroupUserPicker(excludeMembers)`，它只返回 JSX、不引入新的组件边界，因此输入框在重渲染间保持同一个元素，焦点得以保留。创建群聊的 `<GroupUserPicker/>` 与群资料页的 `<GroupUserPicker excludeMembers/>` 都改走该函数，行为与原先一致。

## 数据库迁移

本次无迁移，schema 保持 `17`。部署时 `npm run selfhost:migrate` 为幂等空操作，仍建议照常执行。

## 校验

- 后端 type-check / lint
- 后端测试 11 files / 56 tests
- 前端 type-check / build
- 一键启动端到端构建、同步与重启
- `/api/v1/health` 与 `/api/v1/site/config` HTTP 校验

## 归档约束

本目录只记录发布元数据，不包含 `.env`、密钥、数据库、备份、证书或个人信息。已发布版本的归档文件视为不可变记录；如需勘误，新增说明而不是改写历史。

## 回滚

代码可回到 `v0.11.0`。本次未执行迁移，数据库结构与数据与 `v0.11.0` 一致，回滚代码即可，无需恢复备份。