# WFLA Wall 开发与维护交接规范

本文件是**当前唯一开发副本**的操作说明。仓库已经迁到共享文件夹，目标是在那台可直接访问共享目录的机器上完成开发、测试、部署与回滚，不再维护第二份源码树。

## 1. 唯一工作目录

当前规范工作区：

```text
\\DESKTOP-RRS7HFA\ShareFolder\wfla-wall-selfhost-package
```

> 不要把共享目录当成只读“部署包”。它现在就是 Git 工作区、运行时目录和发布归档入口。
> 在迁移完成前，原开发仓库必须保留；确认共享工作区可以正常 `git pull`、测试、启动和部署后，才可以停止使用旧副本。

## 2. 源码与运行数据

```text
src/                      后端源码，唯一后端入口
frontend/                 前端源码
scripts/                  配置、启动、迁移、建号、备份脚本
docs/                     正式开发文档
archive/                  发布归档说明与不可变发布记录
tests/                    后端测试
public/                   前端构建产物，生成后不入 Git
frontend/dist/            Vite 构建目录，不入 Git
data/                     SQLite 数据库，不入 Git
backups/                  数据库备份，不入 Git
certs/                    TLS 证书和私钥，不入 Git
node_modules/             依赖安装目录，不入 Git
.env                      本机运行配置和密钥，不入 Git
```

**源码只有一个后端树：`src/`。** 历史部署包中的 `src-backend/` 是旧兼容副本，迁移后已废弃；任何脚本、文档和人工操作都不得再以它作为入口。

## 3. 当前维护流程

在共享目录打开 PowerShell，先确认工作区：

```powershell
Set-Location -LiteralPath '\\DESKTOP-RRS7HFA\ShareFolder\wfla-wall-selfhost-package'
git status --short --branch
git log -5 --oneline --decorate
```

首次接触工作区时安装依赖（默认当前机器已有 `node_modules` 时仍可执行校验）：

```powershell
npm install
npm --prefix frontend install
```

提交前全量检查：

```powershell
npm run type-check
npm run lint
npm test
npm --prefix frontend run type-check
npm --prefix frontend run build
```

本地体验启动：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\一键启动.ps1
```

只检查配置和启动条件、不启动服务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\一键启动.ps1 -CheckOnly
```

配置修改、迁移或首次部署：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\一键配置.ps1
```

UNC 路径下不要用 `cmd.exe` 把它当工作目录；脚本已经用脚本自身位置计算项目根目录，并通过 `node + tsx` 绕过 CMD 的 UNC 限制。

## 4. 发布和归档

- 版本号唯一来源：`src/version.ts`。
- `package.json` 和 `frontend/package.json` 的 `version` 必须同步。
- 数据库迁移只增不改；新增迁移后同步 `SCHEMA_VERSION` 并更新 `docs/RELEASE_AND_ARCHIVE.md`。
- 正式发布必须跑全量检查、备份数据库、更新 `docs/CHANGELOG.md`、提交并打 tag。
- `archive/releases/<版本>/` 只记录版本、commit、tag、构建指纹、发布清单和回滚步骤。
- 归档**绝不**放置 `.env`、OAuth Secret、Cookie、邀请码、密码、SQLite/WAL/SHM、证书、学生个人信息或私有部署教程。

详细规则见 [`docs/RELEASE_AND_ARCHIVE.md`](docs/RELEASE_AND_ARCHIVE.md) 和 [`archive/README.md`](archive/README.md)。

## 5. 数据备份与恢复

发布或执行迁移前先备份：

```powershell
npm run selfhost:backup
```

恢复原则：

1. 停止论坛服务；
2. 保存现场数据库和 WAL/SHM；
3. 把目标备份复制为 `data/wfla-wall.sqlite`；
4. 重新启动，核对 `/api/v1/health`；
5. 重要恢复操作记录到发布归档和审计说明中。

备份目录 `/backups` 和数据库 `/data` 属于运行数据，不进入 GitHub。

## 6. 测试与部署边界

- 只改前端时：构建 `frontend`，同步 `frontend/dist` 到 `public/`，无需重启 Node。
- 改后端 `.ts`、迁移或配置加载逻辑时：必须重启 Node 进程。
- 执行迁移前必须先备份；迁移失败时优先“向前修复”，不要删除线上已执行的迁移文件。
- 生产入口必须使用 HTTPS；明文 HTTP 只允许本地或受控内网测试。
- 权限变更、邀请码变更、监管动作和配置变更必须保留审计记录。

## 7. 隐私和公开边界

真实中文姓名、入学届别和账号身份属于校内受控数据。不得把它们写入公开 README、Git 提交、归档清单、问题截图或可公开访问的日志。`.env`、数据库、证书、备份和私有部署教程只留在受控目录，并遵守 `docs/RELEASE_AND_ARCHIVE.md` 的排除清单。

## 8. 交接检查表

接手人应能独立完成：

- [ ] 从共享目录打开工作区，`git status` 正常
- [ ] 确认后端只有 `src/`，没有从 `src-backend/` 启动
- [ ] 跑通后端 type-check、lint、test
- [ ] 跑通前端 type-check、build
- [ ] 理解 `.env`、数据库、备份、证书为什么不入 Git
- [ ] 知道如何备份、恢复、重启和核对健康接口
- [ ] 知道如何新增迁移、更新版本号、更新 changelog、打 tag
- [ ] 能从 `archive/` 找到某个版本的 commit、发布清单和回滚步骤

## 9. 迁移记录

- 2026-10-26：共享目录从“部署包”切换为正式 Git 工作区；以 Git HEAD 的 `src/` 为唯一后端源码，移除旧 `src-backend/` 兼容副本。
- 迁移前备份位于共享文件夹父目录的 `wfla-wall-migration-backup-*`；运行数据、证书和数据库未进入 Git。