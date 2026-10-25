# 前端皮肤（Skin）开发指南

> 皮肤契约版本：**2** ｜ 对应 `SKIN_CONTRACT_VERSION`（`src/version.ts`）

WFLA Wall 的前端被刻意拆成两层：**容器（container）** 与 **皮肤（skin）**。

这样做的原因：前端要交给不同同学协作开发，每个人想做的界面风格差异很大（例如仿 X 的信息流、
档案站风格的 Endfield）。如果把状态管理和布局混在一起，换一套布局就等于重写整个应用。分层后，
**换皮肤 = 换一整个布局组件**，状态、请求、权限判断一行都不用改。

---

## 1. 分层结构

```
frontend/src/
├─ main.tsx                 # 只挂载 <App />
├─ App.tsx                  # 容器：状态 / 请求 / 权限 / 路由 / 消息
└─ skins/
   ├─ base.css              # 文档级基础样式（字体、reset、reduced-motion）
   ├─ contract.ts           # ★ 皮肤契约：唯一的类型来源
   ├─ registry.ts           # ★ 皮肤注册表：id → 懒加载组件 + body class
   ├─ x/                    # 仿 X 皮肤（默认主 UI）
   │  ├─ XSkin.tsx
   │  └─ x.css
   └─ endfield/             # Endfield 皮肤
      ├─ EndfieldSkin.tsx
      ├─ primitives.tsx
      ├─ endfield.css
      ├─ variant.js
      └─ contours/*.svg
```

| 角色 | 职责 | 不做什么 |
| --- | --- | --- |
| `App.tsx`（容器） | 所有 `useState`、`fetch`、登录态、权限、路由 `view`、错误/成功消息、登录后重载 | 不写具体布局 |
| `skins/<id>/*`（皮肤） | 纯展示：把 `forum` 上下文渲染成界面、决定布局与交互外观 | **不发起请求、不存服务端数据、不存 token** |

数据流是单向的：

```
App.tsx  ──构建 SkinContext──▶  <Skin forum={forum} />  ──调用 actions──▶  App.tsx 更新状态 ──▶ 重渲染
```

---

## 2. 皮肤拿到什么：`SkinContext`

皮肤组件只有**一个** prop：

```tsx
export default function MySkin({ forum }: { forum: SkinContext }) { /* … */ }
```

`forum` 的字段（完整定义见 `frontend/src/skins/contract.ts`）：

| 字段 | 用途 |
| --- | --- |
| `site` | 论坛名、标语、版本、**可用皮肤列表**、当前皮肤、`setSkin(id)`、`api_origin`、游客/注册开关 |
| `session` | `me`（`null` 表示游客）、`providers`、`isStaff` / `isAdmin` / `isOwner` |
| `data` | 板块、跨板块动态、书签、搜索结果与其查询词、回复、公告、通知、管理列表与统计计数 |
| `forms` | 受控表单状态（登录、注册、发帖、回复、公告、建板块、高级设置、站点配置、诊断） |
| `messages` | `error` / `success` 与 `clearMessages()` |
| `actions` | 所有可调用的服务端动作（登录、发帖、回复、举报、管理操作…） |
| `view` / `setView` | 站内路由：`home` / `announcements` / `bookmarks` / `search` / `board` / `thread` / `login` / `register` / `notifications` / `settings` / `admin` |
| `helpers` | `formatDate` |
| `ui` | `roleLabel`、`levelLabel`、`adminTabs` 等展示常量 |

### 关键约束

1. **只读**。皮肤不得直接改 `data` / `session`；要改数据就调用 `actions.*`，由容器重新拉取并回灌。
2. **游客也要能渲染**（`session.me === null`），并正确隐藏登录后才有的入口。
3. **键盘可达**、交互元素用语义化标签，并尊重 `prefers-reduced-motion`。
4. **契约只增不改**：在同一个 `SKIN_CONTRACT_VERSION` 内可以自由**新增**字段；删除字段、改类型、
   改语义必须**升版本**（见第 6 节）。

---

## 3. 新增一个皮肤（三步）

### 第 1 步：创建皮肤组件

新建 `frontend/src/skins/<id>/<Name>.tsx`，**默认导出**皮肤组件，并自带一份 CSS（在组件里
`import './<name>.css'`）。参考 `skins/x/XSkin.tsx`。

```tsx
import type { SkinContext } from '../contract';
import './myskin.css';

export default function MySkin({ forum }: { forum: SkinContext }) {
  const { session, data, actions, view, setView, site } = forum;
  return (
    <div className="my-root">
      <header>{site.forum_name}</header>
      {/* 用 data.* 渲染内容，用 actions.* 触发操作，用 setView 做站内跳转 */}
    </div>
  );
}
```

### 第 2 步：注册到前端注册表

编辑 `frontend/src/skins/registry.ts`：

```ts
export const SKIN_COMPONENTS: Record<string, SkinRegistration> = {
  x: { component: lazy(() => import('./x/XSkin')), bodyClass: 'xsk-body' },
  endfield: { component: lazy(() => import('./endfield/EndfieldSkin')), bodyClass: 'ef-body ef-contours' },
  myskin: { component: lazy(() => import('./myskin/MySkin')), bodyClass: 'myskin-body' }  // 新增
};
```

- `lazy(...)` 让浏览器**只下载当前皮肤的代码块**，不会把其它皮肤打进首屏。
- `bodyClass` 会在该皮肤激活时写到 `<body>`，退出时自动移除。需要 body 级背景 / 主题变量的皮肤
  用这个，**不要**在组件里手动改 DOM。

### 第 3 步：注册到后端注册表

编辑 `src/modules/site/skins.ts`：

```ts
export const SKIN_REGISTRY: readonly SkinDescriptor[] = [
  // …
  { id: 'myskin', name: 'My Skin', description: '…', status: 'preview' }
];
```

- `status: 'stable'` 的皮肤可以被设为站点默认；`'preview'` 仅允许用户自选（灰度）。
- 前端与后端的 **id 必须完全一致**，否则皮肤会被后端白名单过滤掉。

完成后重启后端（`src/` 改动需重启），然后在管理后台的「外观」标签页勾选启用即可。

---

## 4. 皮肤切换机制（已实现）

皮肤切换分两个层面，职责不同：

### 4.1 站点层（后端策略，管理员控制）

- `GET /api/v1/site/config` 返回 `default_skin` 与 `skins` 白名单；
- 管理后台「外观」标签（`AdminTab = 'appearance'`）可修改 `default_skin` 与 `allowed_skins`，
  通过 `PATCH /api/v1/admin/site-config` 保存，立即生效、无需重启；
- 若配置的皮肤在前端没有实现，`resolveSkin()` 会回落到 `FALLBACK_SKIN_ID`，页面不会白屏。

### 4.2 用户层（个人偏好，用户控制）

- `site.setSkin(id)` 切换皮肤、写入 `<html data-skin>` / `<body class>` 并持久化到 `localStorage`；
- 已登录用户的选择会额外通过 `PUT /api/v1/me/preferences/skin` 保存到账号，换设备登录后自动沿用（见 `docs/API.md` 第 3 节）；
- 游客只有浏览器本地保存，登录后首次访问会把浏览器中的选择镜像进账号；
- `site.skin_preference_status`（`idle / saving / saved / guest / error`）与 `site.skin_sync_available` 已在皮肤契约中，皮肤可以据此展示同步状态。

### 4.3 用户「设置」页（已实现）

两个默认皮肤都实现了 `view.name === 'settings'` 页面，包含：

- 皮肤选择器（整布局预览与切换）；
- 同步状态提示（已同步到账号 / 仅本浏览器 / 同步失败可重试）；
- 账号信息区（真实姓名、届别、角色——论坛无匿名发帖）。

入口：左侧导航栏「设置」、移动端底部导航「设置」。皮肤作者可以自由重排入口，
但必须保证每个登录用户都能找到它。

---

## 5. 样式约定

- `skins/base.css` 只放**文档级**基础样式（box-sizing、字体、滚动、reduced-motion），不放任何皮肤专属视觉。
- 每个皮肤用**自己的类名前缀**（例如 X 用 `xsk-`，Endfield 用 `ef-`），避免跨皮肤样式互相污染。
- 皮肤 CSS 只应挂在皮肤根节点之下（或明确的前缀类），禁止写裸标签选择器影响其它皮肤。
- 响应式断点参考 X 皮肤：`≤1100px` 折叠为图标侧栏，`≤800px` 隐藏侧栏并显示底部导航。

---

## 6. 契约版本规则

`SKIN_CONTRACT_VERSION` 定义在 `src/version.ts`，并由 `GET /site/config` 暴露给客户端。

| 改动 | 是否升版本 |
| --- | --- |
| `SkinContext` 新增字段 / 新增 action | 否（向后兼容） |
| 新增一个皮肤 id | 否 |
| 重命名、删除、改类型、改某字段语义 | **是** |
| 改变 `View` 状态机、改变 action 签名 | **是** |

升版本时必须同步更新：

1. `src/version.ts` 的 `SKIN_CONTRACT_VERSION`
2. `frontend/src/skins/contract.ts` 顶部注释的版本号
3. 至少一个皮肤的实现（保证新版契约在仓库内有可用范例）
4. 本文件的版本号

> 约定：**契约版本是给皮肤作者看的**。前端在启动时可以比较服务端返回的
> `skin_contract_version` 与本地支持版本，不一致时提示「皮肤契约不匹配」，但不要直接崩溃。

---

## 7. 交接检查清单

给下一位前端同学：

- [ ] 从 `frontend/src/skins/contract.ts` 开始读，而不是从 `App.tsx` 的 JSX 开始。
- [ ] 新皮肤的目录、id、注册表、后端描述表四处保持一致。
- [ ] 保证游客态、登录态、监管态（`isStaff`）三种情况都能正常渲染。
- [ ] 跑通 `npm --prefix frontend run type-check` 与 `npm --prefix frontend run build`。
- [ ] 若要改契约，先开 issue / 讨论，改完升 `SKIN_CONTRACT_VERSION` 并同步文档。
