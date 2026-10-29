# WFLA Wall 发布归档

`archive/` 只保存**可公开、可复核、可回滚**的发布元数据，不保存运行数据或密钥。

当前最新正式版本：**v0.11.1**（2026-10-29）。

## 目录布局

```text
archive/
├─ README.md
├─ manifests/                 通用发布清单模板与说明
└─ releases/
   └─ vX.Y.Z/
      ├─ release.json       版本、commit、tag、兼容版本
      └─ release.md         发布摘要、校验与回滚步骤
```

## 归档内容

每个正式版本至少记录：

- 应用版本、API 版本、数据库 schema 版本、皮肤契约版本；
- Git commit 与 annotated tag；
- 发布前跑过的检查项；
- 数据库迁移文件和是否已执行；
- 部署产物来源、构建命令、回滚目标；
- 数据库备份的时间与用途（只记录位置/说明，不复制数据库本身）。

## 严禁归档

以下内容**绝不能**进入 Git、GitHub Release 或公开归档：

- `.env` 及任何 OAuth / 会话 / 邀请码密钥；
- 管理员密码、Cookie、用户凭据；
- SQLite、WAL、SHM、数据库备份；
- TLS 私钥、证书目录、Caddy 数据目录；
- 学生姓名、学号、届别、IP、访问日志等个人信息；
- 私有网络部署教程和内部联系方式。

## 使用规则

1. 正式发版前按 `docs/RELEASE_AND_ARCHIVE.md` 执行全量检查和数据库备份。
2. 发版后先确认 `git tag` 与 commit，再写入对应版本目录。
3. 已发布版本的归档文件视为不可变记录；如需勘误，新增说明而不是改写历史。
4. 未发布改动写进 `docs/CHANGELOG.md` 的 `[Unreleased]`，达到发布条件后再建立版本目录。