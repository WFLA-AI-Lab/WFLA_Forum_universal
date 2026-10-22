# WFLA Wall Frontend

临时前端，用于内测联调。界面使用 Endfield 风格网页套件。

## 运行

```bash
npm install
npm run dev
```

后端默认地址是 `http://127.0.0.1:8787/api/v1`，可用 `.env.local` 覆盖：

```bash
VITE_API_BASE=https://your-backend.example.com/api/v1
```

## 构建

```bash
npm run build
npm run preview
```

## 当前功能

- 游客浏览公告、板块和话题。
- 内部账号登录。
- 登录后发起新话题、回复话题。
- 展示作者真实中文姓名和届别。
- 移动端和桌面基础适配。

## 安全说明

后端已对 Markdown 输出做白名单净化，前端渲染 `content_html`。不要在前端追加未净化 HTML。
