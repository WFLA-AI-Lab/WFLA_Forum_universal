# WFLA Wall 自托管部署（Windows / Node.js）

本目录是可直接运行的完整自托管包：Node.js 同时提供 React 前端、论坛 API 和 SQLite 数据库。

## 快速开始

在项目内打开 PowerShell，双击 `scripts\一键配置.cmd`；或者运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\一键配置.ps1
```

首次配置会依次询问：

1. 监听方式：仅本机、局域网、反向代理/内网穿透
2. 端口和浏览器实际访问地址
3. 论坛名称
4. 是否创建 4 个默认板块
5. 管理员用户名、密码、真实中文姓名、届别
6. 第三方登录方式（Microsoft、GitHub，或暂时都不启用）

脚本会生成 `.env` 和会话密钥，检查依赖，执行迁移，构建前端并创建管理员。脚本使用相对路径，不受当前终端目录影响。已有 `.env` 时会询问是否覆盖；选择保留时不会修改密钥，也不会重复创建 owner。

第三方登录支持在配置过程中选择：

- `1` 不启用第三方登录
- `2` Microsoft 登录
- `3` GitHub 登录
- `4` Microsoft 和 GitHub 都启用

任意输入步骤都可以输入 `b` 返回上一步；登录方式子步骤输入 `b` 会回到登录方式选择。配置脚本会按选择写入 `MS_*` 或 `GITHUB_*` 环境变量，未填写的提供商不会出现在登录页。

配置完成后，日常启动：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\一键启动.ps1
```

也可以双击 `scripts\一键启动.cmd`。启动脚本会检查配置、数据库和前端文件，缺失前端时自动构建，然后在当前窗口运行服务。停止服务按 `Ctrl+C`。

只做环境自检、不启动服务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\一键启动.ps1 -CheckOnly
```

## 环境和网络

- Windows 10/11 或 Windows Server
- Node.js 22.12 或更高版本（推荐 Node.js 22 LTS）
- 内网测试：防火墙放行 `PORT`（默认 8888），浏览器使用 `PUBLIC_ORIGIN`
- 公网访问：必须通过 HTTPS 反向代理或可信内网穿透，并把 `PUBLIC_ORIGIN` 改成实际 HTTPS 地址
- 只有前面确实有可信反向代理时才设置 `TRUST_PROXY_HEADERS=true`

`.env` 由一键配置生成，绝对不要提交到 Git。数据位置：

```text
data/wfla-wall.sqlite    论坛数据库
backups/                 备份目录
public/                  构建后的前端
```

## 手动操作（备用）

```powershell
npm ci --ignore-scripts
npm run selfhost:migrate
npm run selfhost:build
npm run selfhost:create-owner -- <用户名> <真实姓名> <届别>
npm run selfhost:start
```

上面建号命令推荐配合 `WFLA_OWNER_PASSWORD` 环境变量使用，避免密码出现在命令历史。正常使用请优先运行一键配置脚本。

## 备份

```powershell
npm run selfhost:backup
```

恢复：先停止服务，将备份文件复制为 `data/wfla-wall.sqlite`，再启动。

## 开机自启

以当前用户登录后自动启动：

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\selfhost-windows-install.ps1
```

该脚本需要 PowerShell 7。也可以直接使用一键启动脚本验证服务本身；无人值守服务建议后续用 NSSM 或 WinSW 包装。

## 安全

1. `.env`、`data/`、`backups/` 不属于源码，不能上传
2. 公网必须使用 HTTPS，不能让明文 HTTP 承载密码和会话
3. 权限默认拒绝，敏感操作有审计日志
4. 定期备份，定期检查服务器访问日志与依赖更新
5. 面向学校正式开放前，确认学校授权、内容监管和备案等流程

## 目录说明

```text
src/               前端源码（打包版）
src-backend/       扁平化的后端源码（打包版）
frontend/          仓库版前端源码
scripts/           配置、启动、迁移、建号、备份脚本
public/            构建后的前端
data/              SQLite 数据库
backups/           数据库备份
.env               本机配置，不在 Git 中
```

## 可选：本地 Caddy HTTPS 源站

如果内网穿透要求“源站协议为 HTTPS”，可以让 Caddy 在本地解密 TLS：

```text
浏览器/隧道 -> https://127.0.0.1:8443 -> Caddy -> http://127.0.0.1:8888 -> 论坛
```

论坛仍然只监听 `8888`，不需要再开业务端口。

依次运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-caddy.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\configure-caddy.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-with-caddy.ps1
```

`configure-caddy.ps1` 会在本机生成：

```text
Caddyfile
certs/site.crt
certs/site.key
certs/root-ca.crt
```

这些都是本机运行数据，已加入 `.gitignore`，不要提交或上传。

隧道填写：

```text
本地地址：127.0.0.1
本地端口：8443
协议类型：HTTPS
源协议：HTTPS
SSL 证书：certs/site.crt
SSL 私钥：certs/site.key
```

如果隧道程序不接受私钥路径，而由它自己处理源站 TLS，则把本地端口改成 `8888`、协议改为 HTTP，不要启用“源站 HTTPS”。

这里生成的是内部 CA 证书，浏览器不会自动信任它。它只用于本地 HTTPS 源站链路；公网访客应通过隧道或 Cloudflare 的公开受信证书访问。需要让隧道客户端信任本地 CA 时，把 `certs/root-ca.crt` 导入该客户端所在机器的“受信任的根证书颁发机构”。

如果隧道面板无法导入根 CA，不要强行使用“HTTPS + 自签证书”模式。改用它的纯 HTTP 映射，或使用 Cloudflare Tunnel。