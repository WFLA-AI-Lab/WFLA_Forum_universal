# WFLA Wall 自托管部署（Windows / Node.js）

本部署包保留 Cloudflare 代码，同时新增自托管模式：Node.js + better-sqlite3 + Hono。服务启动后，一个进程同时提供：

1. `public/` 中的 React 静态前端
2. `/api/v1/*` 后端 API
3. `data/wfla-wall.sqlite` 本地 SQLite 数据库

## 服务器要求

- Windows 10/11 或 Windows Server
- Node.js 20 或更高版本
- PowerShell 7（用于服务脚本；日常 npm 命令可用 PowerShell 5.1）
- 硬盘至少 2 GB 空间
- 防火墙放行访问端口（默认 8787）

## 第一次安装

```powershell
cd C:\wfla-wall
npm ci
npm run selfhost:migrate
npm run selfhost:build
Copy-Item .\frontend\dist\* .\public -Recurse -Force
Copy-Item .\.env.selfhost.example .\.env
notepad .\.env
```

`.env` 必须改：

- `PUBLIC_ORIGIN`：浏览器访问你的完整地址，例如 `http://192.168.1.10:8787` 或 `https://forum.example.com`
- `AUTH_SESSION_SECRET`：长随机字符串

创建管理员账号：

```powershell
npm run selfhost:create-owner -- AdminUser YourStrongPassword123! 真实中文姓名 2026
```

然后启动：

```powershell
npm run selfhost:start
```

浏览器打开 `PUBLIC_ORIGIN`。看到首页即成功。

## 每次更新代码

```powershell
npm ci
npm run selfhost:migrate
npm run selfhost:build
Copy-Item .\frontend\dist\* .\public -Recurse -Force
npm run selfhost:start
```

## 开机自启（Windows）

以当前用户登录后自动运行：

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\selfhost-windows-install.ps1
```

手动启动/停止：

```powershell
Start-ScheduledTask -TaskName 'WFLA Wall SelfHost'
Stop-ScheduledTask -TaskName 'WFLA Wall SelfHost'
```

删除自启任务：

```powershell
Unregister-ScheduledTask -TaskName 'WFLA Wall SelfHost' -Confirm:$false
```

## 备份与恢复

```powershell
npm run selfhost:backup
```

备份在 `backups/`。恢复时停掉服务，把备份文件复制回 `data/wfla-wall.sqlite`，再启动。

## 安全要求

1. 公网正式使用必须上 HTTPS，`PUBLIC_ORIGIN` 改成 `https://...`
2. 如果前面有可信反向代理/内网穿透，把 `TRUST_PROXY_HEADERS=true`；否则保持 `false`
3. `.env`、`data/`、`backups/` 都不能提交到 Git
4. 定期备份
5. 服务器上只开放必要端口
6. 如果要面向学校开放，后续要走 ICP 备案流程，不要直接用个人内网服务做正式服务

## Linux/macOS

命令相同：

```bash
npm ci
npm run selfhost:migrate
npm run selfhost:build
mkdir -p public
cp -R frontend/dist/* public/
npm run selfhost:start
```

建议用 `systemd` 或 `pm2` 管理。