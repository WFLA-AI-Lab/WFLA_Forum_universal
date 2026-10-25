# WFLA 校园论坛前端

React + Vite 前端，使用容器 / 皮肤分离架构。默认 X 风格首页只显示跨板块「校园动态」，公告与板块从「社区空间」进入；保留原有 Endfield 皮肤及个人皮肤偏好设置。页面不填充虚构帖子，内容来自 API。

## 运行

在仓库根目录运行后端，在 `frontend` 目录运行前端，分别开两个终端：

```powershell
# 仓库根目录
npm install
npm run migrate:local
npm run dev -- --port 8888

# frontend 目录
npm install
npm run dev
```

访问 `http://localhost:5173/`。Vite 默认将 `/api` 代理到 `http://127.0.0.1:8888`，同源使用后端 HttpOnly 会话 Cookie。如端口不同，可在 `frontend/.env.local` 配置 `VITE_API_PROXY_TARGET`。生产部署继续使用仓库已有的 Pages `_worker.js` 代理和 `WFLA_API_ORIGIN`。

Windows 上如果根目录 `npm install` 因 `better-sqlite3` 原生模块编译失败，Cloudflare Worker/D1 联调可使用 `npm install --ignore-scripts`；自托管 SQLite 模式仍需原生模块正常安装。

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
