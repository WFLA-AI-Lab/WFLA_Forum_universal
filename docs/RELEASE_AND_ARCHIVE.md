# 版本、发版与存档体系

本文规定 WFLA Wall 的版本号规则、发版流程、数据库迁移对应关系，以及数据存档 / 备份约定。
目标：**任何一次交接、回滚或迁移都能顺着版本号找到对应代码、数据库结构与备份。**

---

## 1. 版本号的唯一来源

所有版本号集中在 **`src/version.ts`**，不要在别处硬编码：

```ts
export const APP_VERSION = '0.10.0';         // 应用（产品）版本
export const API_VERSION = 'v1';             // HTTP 契约版本
export const SCHEMA_VERSION = 14;             // 数据库结构版本（= 最高迁移序号）
export const SKIN_CONTRACT_VERSION = 3;      // 前端皮肤契约版本
```

`package.json` 与 `frontend/package.json` 的 `version` 字段必须与 `APP_VERSION` 保持一致
（发版时一起改）。运行时通过 `GET /api/v1/health` 与 `GET /api/v1/site/config` 暴露这些值，
所以**部署后能直接从 HTTP 响应里核对线上版本**。

---

## 2. 版本号规则（SemVer）

采用 `MAJOR.MINOR.PATCH`：

| 段 | 何时递增 | 例子 |
| --- | --- | --- |
| `MAJOR` | 不兼容的数据 / API 变更，或需要运维手动迁移的大改造 | `1.0.0` → `2.0.0` |
| `MINOR` | 向后兼容的新功能（新接口、新皮肤、新管理能力） | `0.1.0` → `0.2.0` |
| `PATCH` | 向后兼容的缺陷修复、文案、安全修补 | `0.1.0` → `0.1.1` |

配套规则：

- **`MAJOR = 0` 阶段**（当前）允许小步快跑，但仍应遵守：破坏性变更至少升 `MINOR`。
- `API_VERSION` 只在**破坏性接口变更**时递增；一旦发布过某个 API 版本，就只加不改（见 `docs/API.md` 第 11 节）。
- `SKIN_CONTRACT_VERSION` 与 API 版本**相互独立**，皮肤契约的破坏性变更单独递增。
- 每个正式版本都必须有对应的 git tag 与 `CHANGELOG` 条目。

---

## 3. 数据库迁移与 SCHEMA_VERSION

数据库结构版本 = `src/migrations/` 下**编号最大的那个文件**的序号。

| 迁移文件 | SCHEMA_VERSION | 内容 |
| --- | --- | --- |
| `0001_init.sql` | 1 | 核心表：users / sessions / boards / threads / posts / reports / audit_logs |
| `0002_invitations_external_auth.sql` | 2 | 邀请码、外部身份绑定 |
| `0003_microsoft_oauth.sql` | 3 | Microsoft OAuth 字段 |
| `0004_engagement.sql` | 4 | 反应、收藏、浏览量等互动数据 |
| `0005_oauth_providers.sql` | 5 | 多 OAuth 提供方支持 |
| `0006_app_settings.sql` | 6 | `app_settings` 表（运行时配置） |
| `0007_site_settings.sql` | 7 | 站点外观 / 注册策略默认值（`default_skin`、`allowed_skins` 等） |
| `0008_user_preferences.sql` | **8** | `user_preferences` 表（每用户偏好，当前仅 `skin_id`） |
| `0009_user_profiles.sql` | **9** | 用户昵称与头像 |
| `0010_admin_console.sql` | **10** | 管理备注、处置历史、邀请码吊销字段与管理查询索引 |
| `0011_enrollment_year.sql` | **11** | 将 `users.graduation_year` 重命名为 `enrollment_year`，保留全部用户数据 |
| `0012_invitation_roles.sql` | **12** | 邀请码增加目标角色：成员 / 监管者 / 管理员；旧邀请码默认为成员 |
| `0014_chat.sql` | **14** | 私聊、后台管理群聊与消息举报 |
| `0013_moderation_automation.sql` | **13** | 自动监管规则、风险事件、申诉与处罚到期字段 |

### 迁移铁律

1. 迁移文件**只增不改**。已发布过的迁移文件一旦被线上执行过，就不再编辑它。
2. 新迁移的文件名必须是下一个序号：`0013_xxx.sql`。
3. 新增迁移后，把 `src/version.ts` 的 `SCHEMA_VERSION` 同步 +1，并更新上面的表格。
4. 迁移应当**幂等**（用 `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`），以便重复执行安全。
5. 自托管部署的迁移命令：

```bash
npm run selfhost:migrate
```

> `0007` 未执行时，站点配置会回落到编译期默认值（皮肤 = `x`），
> 站点不会崩，但后台「外观」设置无法持久化 —— 所以升级后务必跑一次迁移。

---

## 4. 发版流程（Release Checklist）

以发布 `v0.10.0` 为例：

1. **确认版本号**：改 `src/version.ts`、`package.json`、`frontend/package.json` 三处一致。
2. **确认迁移**：若新增了迁移，`SCHEMA_VERSION` 已同步，本文档表格已更新。
3. **跑全量检查**（必须全绿）：

```bash
npm run type-check
npm run lint
npm test
npm --prefix frontend run type-check
npm --prefix frontend run build
```

4. **本地 / 预发布验证**：启动 `npm run selfhost:dev`，至少核对
   `GET /api/v1/health`、`GET /api/v1/site/config`、登录、发帖、公告、举报、后台外观切换。
5. **更新 `docs/CHANGELOG.md`**：新版本条目在最上方，写清新增 / 变更 / 修复 / 破坏性变更。
6. **提交并打 tag**：

```bash
git add -A
git commit -m "release: v0.10.0"
git tag -a v0.10.0 -m "WFLA Wall v0.10.0"
git push origin main --follow-tags
```

7. **部署**：按 `docs/RELEASE_AND_ARCHIVE.md` 第 6 节的部署步骤同步到服务器，并执行迁移。
8. **文档版号核对**：README、API、ARCHITECTURE、CHAT_API、皮肤指南等面向协作者的文档，不得再出现旧的当前版号；历史版本只允许出现在 CHANGELOG 与 archive/releases。

### 版本回滚

- 代码回滚：`git checkout v<上一个版本>`（或 revert 对应提交）。
- **数据库不做自动回滚**：迁移是单向的。若新迁移有破坏性，必须先备份、再写一个「向前修复」的
  新迁移（`0015_...`），而不是删除旧迁移。
- 因此：**任何含迁移的发布，部署前必须先备份**（见下节）。

---

## 5. 存档与备份体系

### 5.1 数据库备份

自托管数据库默认位于 `data/wfla-wall.sqlite`（可用 `WFLA_DB_PATH` 覆盖）。

```bash
npm run selfhost:backup
```

该命令会：

1. 执行 `wal_checkpoint(TRUNCATE)`，把 WAL 日志落盘；
2. 用 SQLite 在线备份 API 生成一份一致性快照；
3. 输出到 `backups/wfla-wall-<ISO时间戳>.sqlite`。

规则：

- `backups/` **不入库**（已在 `.gitignore` / `.git/info/exclude` 中排除），避免把真实数据推上 GitHub。
- 建议在**每次发版前、每次执行迁移前**各备份一次。
- 建议按「保留最近 N 份 + 每月一份长期存档」的策略清理旧备份。

### 5.2 配置与密钥存档

**绝对不要**把下列内容提交到 git 或放进交付包：

- `.env` / `.env.*`（除 `.env.example`、`.env.selfhost.example`）
- `*.sqlite` 及其 WAL / SHM 文件
- `AUTH_SESSION_SECRET`、`GITHUB_CLIENT_SECRET`、`MS_CLIENT_SECRET`
- owner 密码、任何用户真实凭据
- TLS 证书 / 私钥、`tools/caddy/`、`certs/`、`caddy-data/`
- 内部私有部署教程（例如 `docs/NETWORK_AND_DEPLOYMENT_GUIDE.md`，仅本机保留）

密钥应保存在受控位置（例如服务器的 `.env`，权限收窄为仅服务账号可读），并在**离线密码管理器**中留一份恢复副本。

### 5.3 代码存档

- `main` 分支 = 可发布状态；所有面向协作者的内容（README、`docs/API.md`、皮肤指南）必须同步更新。
- 每次发版打 **附注 tag**（`git tag -a v0.10.0`），tag 就是不可变的存档点。
- 历史被安全重写过（如清理过泄露的密钥）之后，任何旧克隆都必须**重新克隆**，不能 merge 旧历史。

---

## 6. 自托管部署（简版）

服务器目录结构与同步顺序（详情以服务器上的一键脚本为准）：

1. 拉取 / 复制新代码（`src/`、`frontend/`、`scripts/`、配置模板）。
2. `npm install`（必要时 `npm --prefix frontend install`）。
3. 执行迁移：`npm run selfhost:migrate`。
4. 构建前端：`npm run selfhost:build`。
5. 同步前端产物到 `public/`：使用当前一键脚本的**整目录替换**（先清空 `public/`，再从 `frontend/dist` 完整复制），避免旧 chunk 残留。
6. **改动了后端 `.ts` → 必须重启进程**；只改前端 → 无需停机（每请求读盘 + 内容哈希文件名）。
7. 启动：`scripts/一键启动.cmd`（服务器上）。
8. 线上核对 `GET /api/v1/health` 的 `version`。

---

## 7. 每次发版的固定产出

- [ ] `src/version.ts`、两个 `package.json`、两个 lockfile 与前端 fallback 版本一致
- [ ] `docs/CHANGELOG.md` 新条目
- [ ] `SCHEMA_VERSION` 与迁移表一致（如本次有迁移）
- [ ] 全量检查通过（type-check / lint / test / frontend build）
- [ ] 部署前数据库备份
- [ ] git tag `vX.Y.Z` 已推送
- [ ] 线上 `/api/v1/health` 版本核对无误

\n
