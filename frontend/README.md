# WFLA 校园论坛前端

React + Vite 前端，使用容器 / 皮肤分离架构。旧的两套展示皮肤已移除，当前只有重做前的占位界面；页面不填充虚构帖子，内容仍来自 API。

## 运行

开发时在仓库根目录运行自托管 Node + SQLite 后端，在 `frontend` 目录运行 Vite，分别开两个终端（首次需完成根目录 `.env` 配置）：

```powershell
# 仓库根目录
npm ci
npm run selfhost:migrate
npm run selfhost:dev

# frontend 目录
npm install
npm run dev
```

访问 `http://localhost:5173/`。Vite 默认将 `/api` 代理到 `http://127.0.0.1:8888`，同源使用后端 HttpOnly 会话 Cookie。如端口不同，可在 `frontend/.env.local` 配置 `VITE_API_PROXY_TARGET`。

生产环境采用自托管 Node + SQLite：运行根目录 `scripts/一键配置.ps1` 完成初次配置、数据库迁移、前端构建及管理员创建，日常通过 `scripts/一键启动.ps1` 启动。构建产物复制到根目录 `public/`，由同一个 Node 端口同时提供静态前端和 `/api/v1`；公网访问由 HTTPS 反向代理或内网穿透接入。详见 [`../SELFHOST_README.md`](../SELFHOST_README.md)。仓库保留的 Pages `_worker.js` / D1 文件仅为遗留兼容层，不是现行部署链路。

首次进入会显示欢迎动画；同一浏览器会话刷新或再次进入不再阻塞。`prefers-reduced-motion` 下直接跳过。

## 构建

```bash
npm run build
npm run preview
```

## 当前功能

- 跨板块动态时间线、游标分页、板块、话题、回复、公告、搜索。
- 邀请注册、账号登录、Microsoft/GitHub OAuth（完成配置时）、收藏、点赞、举报、通知。
- 用户激活、邀请码、举报处理、公告与板块、高级设置及皮肤偏好。
- 桌面与移动端适配。

最初提出的 `admin/teacher/student`、八位学号、入学日期与班级自动更新尚无后端契约，详见 [`../docs/FRONTEND_BACKEND_GAPS.md`](../docs/FRONTEND_BACKEND_GAPS.md)。

## 安全说明

后端已对 Markdown 输出做白名单净化，前端只渲染 API 返回的 `content_html` / `preview_html`。不要在前端追加未净化 HTML。
