# Z-image Prompt 管理网站

一个可直接上传到 GitHub，并部署到 Vercel 的 Prompt 管理站。

技术栈：

- React 19
- TypeScript
- Vite
- Vercel Functions
- GitHub Contents API
- GitHub OAuth

核心目标：

- 游客只读浏览、筛选、复制 Prompt
- 管理员通过 GitHub OAuth 登录
- 只有白名单中的 GitHub 账号才能执行写操作
- 预览图上传到仓库 `public/uploads/`
- `prompts.json` 写回仓库 `data/prompts.json`
- 支持 JSON 导入 / 导出
- 无数据库，认证使用 `HttpOnly Cookie + JWT`

## 1. 为什么这样设计

Vercel 静态托管和纯前端页面不能把用户上传的图片永久写进部署磁盘，因为运行环境是只读 / 临时的。

所以本项目的主方案是：

1. 前端上传图片到 `/api/upload-image`
2. Vercel Function 调用 GitHub Contents API
3. 图片 commit 到仓库 `public/uploads/`
4. Prompt 数据 commit 到仓库 `data/prompts.json`
5. Vercel 监听 GitHub 新 commit 并重新部署

这样就满足了“图片和数据都真实存在于仓库目录，而不是浏览器缓存”。

补充说明：

- 图片刚上传成功后，到 Vercel 完成新部署之间会有一个短暂窗口期
- 这段时间静态路径 `/uploads/xxx.png` 可能还没同步到当前部署
- 所以项目额外提供了 `/api/image?path=/uploads/xxx.png` 作为回退读取
- 前端会优先加载静态路径，失败后自动回退到 `/api/image`

管理员认证方面，本项目不再使用共享密码，而是改成：

1. 点击“GitHub 管理员登录”
2. 跳转 GitHub OAuth 授权
3. GitHub 回调到 `/api/auth/github/callback`
4. 服务端读取 GitHub 用户信息
5. 只有 `GITHUB_ADMIN_USERS` 白名单中的账号才发管理员 Cookie

这比共享密码更适合 GitHub + Vercel 的部署方式，也更容易撤权和审计。

## 2. 项目结构

```text
.
├─ api/
│  ├─ _lib/
│  │  ├─ data-store.ts
│  │  ├─ env.ts
│  │  ├─ github.ts
│  │  ├─ http.ts
│  │  ├─ oauth.ts
│  │  ├─ session.ts
│  │  └─ upload.ts
│  ├─ auth/
│  │  └─ github/
│  │     └─ callback.ts
│  ├─ prompts/
│  │  ├─ import.ts
│  │  └─ save.ts
│  ├─ image.ts
│  ├─ login.ts
│  ├─ logout.ts
│  ├─ prompts.ts
│  └─ upload-image.ts
├─ data/
│  └─ prompts.json
├─ dev/
│  └─ server.ts
├─ public/
│  └─ uploads/
│     └─ .gitkeep
├─ shared/
│  ├─ contracts.ts
│  └─ prompt-schema.ts
├─ src/
│  ├─ components/
│  │  ├─ AdminPanel.tsx
│  │  ├─ LoginModal.tsx
│  │  ├─ PromptCard.tsx
│  │  ├─ PromptDetail.tsx
│  │  └─ PromptImage.tsx
│  ├─ lib/
│  │  ├─ api.ts
│  │  ├─ drafts.ts
│  │  └─ format.ts
│  ├─ App.tsx
│  ├─ index.css
│  └─ main.tsx
├─ .env.example
├─ .gitignore
├─ README.md
├─ eslint.config.js
├─ index.html
├─ package.json
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts
```

## 3. 本地运行

### 3.1 安装依赖

```bash
npm install
```

### 3.2 配置环境变量

复制一份：

```bash
cp .env.example .env
```

Windows PowerShell 可以直接手动新建 `.env` 文件。

### 3.3 启动开发环境

```bash
npm run dev
```

这个命令会同时启动：

- Vite 前端开发服务器
- 本地 API 开发服务器 `dev/server.ts`

Vite 会把 `/api/*` 代理到本地 API 服务，所以本地不需要额外跑 `vercel dev`。

## 4. 必需环境变量

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `SESSION_SECRET` | 是 | JWT 签名密钥，必须足够长 |
| `GITHUB_OAUTH_CLIENT_ID` | 是 | GitHub OAuth App 的 Client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | 是 | GitHub OAuth App 的 Client Secret |
| `GITHUB_OAUTH_REDIRECT_URI` | 建议 | OAuth 回调地址，推荐显式设置 |
| `GITHUB_ADMIN_USERS` | 是 | 允许进入管理员模式的 GitHub 用户名，多个用逗号分隔 |
| `GITHUB_OWNER` | 否 | GitHub 仓库 owner |
| `GITHUB_REPO` | 否 | GitHub 仓库名 |
| `GITHUB_BRANCH` | 否 | 默认 `main` |
| `GITHUB_TOKEN` | 否 | Fine-grained token，需 `Contents: Read and write` |
| `DATA_PATH` | 否 | 默认 `data/prompts.json` |
| `UPLOAD_DIR` | 否 | 默认 `public/uploads` |

说明：

- `SESSION_SECRET + GITHUB_OAUTH_* + GITHUB_ADMIN_USERS` 用于管理员认证
- `GITHUB_*` 写回变量全部配置后，才会启用真正的 GitHub 持久化
- 如果没有 `GITHUB_TOKEN`，网站会自动进入“本地只读 / 临时编辑模式”
- 即使没有 `GITHUB_TOKEN`，你仍然可以先把 OAuth 跑通，验证管理员登录链路

## 5. GitHub OAuth 管理员模式

### 5.1 认证流程

1. 用户点击“GitHub 管理员登录”
2. 前端跳转 `GET /api/login?next=/?admin=1`
3. 服务端生成 OAuth state 和 PKCE code verifier，写入 `HttpOnly Cookie`
4. 浏览器跳转 GitHub 授权页
5. GitHub 回调 `/api/auth/github/callback`
6. 服务端换取 access token，并调用 `GET https://api.github.com/user`
7. 判断当前 GitHub `login` 是否在 `GITHUB_ADMIN_USERS` 白名单中
8. 如果允许，则签发管理员 session Cookie
9. 后续所有写接口继续校验管理员 Cookie

### 5.2 白名单示例

```env
GITHUB_ADMIN_USERS=tommydeng,another-admin
```

只有这些 GitHub 用户名能进入管理员模式。

### 5.3 GitHub OAuth App 创建方法

1. 打开 GitHub
2. 进入 `Settings`
3. 进入 `Developer settings`
4. 进入 `OAuth Apps`
5. 点击 `New OAuth App`

推荐填写：

- `Application name`: `Z-image Prompt Admin`
- `Homepage URL`: 你的站点地址，例如 `https://your-site.vercel.app`
- `Authorization callback URL`: 你的回调地址，例如 `https://your-site.vercel.app/api/auth/github/callback`

本地开发时，建议单独用一套本地环境变量：

```env
GITHUB_OAUTH_REDIRECT_URI=http://localhost:5173/api/auth/github/callback
```

注意：

- GitHub OAuth App 的回调地址必须和你实际发起授权时使用的地址一致
- 生产环境和本地开发通常需要分别配置各自的回调 URL

## 6. 无 GitHub 写回的本地模式

如果没有配置 `GITHUB_TOKEN`，项目仍然可以运行：

- 前台游客仍可浏览、搜索、复制 Prompt
- 管理员仍可通过 GitHub OAuth 登录
- 管理后台仍可在浏览器里临时编辑 Prompt / 分类
- 可导出 JSON
- 可导入 JSON 到当前浏览器草稿

但以下操作会被禁用：

- 保存到 GitHub
- 上传图片到仓库
- 服务端导入并写回

页面上会显示“本地临时模式”提示。

## 7. GitHub Token 创建方法

推荐使用 Fine-grained personal access token，不要直接使用大权限 classic token。

### 7.1 创建步骤

1. 打开 GitHub
2. 进入 `Settings`
3. 进入 `Developer settings`
4. 进入 `Personal access tokens`
5. 选择 `Fine-grained tokens`
6. 点击 `Generate new token`

### 7.2 最小权限建议

仓库权限至少给：

- `Contents`: `Read and write`

如果仓库是私有仓库，也要保证这个 token 能访问目标仓库。

### 7.3 填写到环境变量

```env
GITHUB_OWNER=你的 GitHub 用户名或组织名
GITHUB_REPO=你的仓库名
GITHUB_BRANCH=main
GITHUB_TOKEN=你的 fine-grained token
```

## 8. Vercel 部署步骤

### 8.1 上传到 GitHub

先把当前项目推到一个 GitHub 仓库。

### 8.2 导入到 Vercel

1. 登录 Vercel
2. 点击 `Add New...`
3. 选择 `Project`
4. 选择你的 GitHub 仓库
5. Framework Preset 选择 `Vite`
6. 保持默认构建命令即可

### 8.3 在 Vercel 配置环境变量

到项目的 `Settings -> Environment Variables` 添加：

```env
SESSION_SECRET=xxxx
GITHUB_OAUTH_CLIENT_ID=xxxx
GITHUB_OAUTH_CLIENT_SECRET=xxxx
GITHUB_OAUTH_REDIRECT_URI=https://你的域名/api/auth/github/callback
GITHUB_ADMIN_USERS=你的github用户名,另一个管理员
GITHUB_OWNER=你的owner
GITHUB_REPO=你的repo
GITHUB_BRANCH=main
GITHUB_TOKEN=xxxx
DATA_PATH=data/prompts.json
UPLOAD_DIR=public/uploads
```

然后重新部署。

### 8.4 部署后的数据流

部署完成后：

1. 游客访问首页
2. 前端读取 `GET /api/prompts`
3. 管理员点击 GitHub 登录并拿到 `HttpOnly Cookie`
4. 管理员修改内容后点击“保存到 GitHub”
5. Function 调 GitHub Contents API commit 更新
6. GitHub 仓库产生新 commit
7. Vercel 自动触发新部署

## 9. API 接口

### `GET /api/prompts`

返回当前最新 Prompt 数据。

返回字段包含：

- `data`
- `sha`
- `isAdmin`
- `writable`
- `githubConfigured`
- `authConfigured`
- `authProvider`
- `adminUser`
- `source`

### `GET /api/login`

发起 GitHub OAuth 登录流程。

可带参数：

- `next`

例如：

```text
/api/login?next=/?admin=1
```

### `GET /api/auth/github/callback`

GitHub OAuth 回调接口。

作用：

- 校验 OAuth state
- 校验 PKCE
- 换取 access token
- 读取 GitHub 用户信息
- 判断是否在白名单中
- 写入管理员 session Cookie

### `POST /api/logout`

清除管理员 Cookie。

### `POST /api/prompts/save`

管理员专用。

请求体：

```json
{
  "sha": "当前客户端看到的 data/prompts.json sha",
  "data": {
    "schemaVersion": 1,
    "categories": [],
    "prompts": []
  }
}
```

作用：

- 校验管理员会话
- 校验 schema
- 使用当前 sha 写回 GitHub
- 若 sha 不一致则返回冲突，让前端提示“请重试”

### `POST /api/prompts/import`

管理员专用。

请求体：

```json
{
  "mode": "merge",
  "sha": "当前客户端 sha",
  "incoming": {
    "schemaVersion": 1,
    "categories": [],
    "prompts": []
  }
}
```

支持：

- `merge`
- `overwrite`

### `POST /api/upload-image`

管理员专用。

请求格式：

- `multipart/form-data`

字段：

- `promptId`
- `existingImagePath` 可选
- `image`

限制：

- 只允许 `PNG / JPG / WEBP / GIF`
- 图片大小 `<= 2MB`

### 额外接口：`GET /api/image?path=/uploads/xxx.png`

这是为了处理“图片刚 commit 但当前部署的静态文件还没刷新”的窗口期。

前端显示策略：

1. 先加载静态路径 `/uploads/xxx.png`
2. 如果当前部署还没有这张图，则自动回退到 `/api/image`

## 10. 并发与冲突处理

本项目采用最简单可行的冲突处理：

1. 前端通过 `GET /api/prompts` 获取当前 `sha`
2. 保存时把这个 `sha` 一起提交
3. 服务端保存前再次检查最新 `sha`
4. 如果发现文件已经变化，则返回 `409`
5. 前端提示用户刷新后重试

这可以避免多人同时编辑时直接覆盖彼此数据。

## 11. 数据结构

```ts
{
  schemaVersion: number
  categories: {
    id: string
    name: string
    order: number
  }[]
  prompts: {
    id: string
    title: string
    content: string
    categoryId: string
    tags?: string[]
    imagePath?: string
    createdAt: string
    updatedAt: string
  }[]
}
```

当前实现中：

- `schemaVersion` 固定为 `1`
- `imagePath` 必须匹配 `/uploads/xxx.(png|jpg|jpeg|webp|gif)`
- 导入 JSON 时会严格校验字段与分类关联关系

## 12. 安全说明

- `GITHUB_TOKEN` 不会暴露到前端
- `GITHUB_OAUTH_CLIENT_SECRET` 不会暴露到前端
- 写接口全部要求管理员 Cookie
- Cookie 为 `HttpOnly`
- 会话 token 使用 `SESSION_SECRET` 进行 JWT 签名
- OAuth 流程带有 `state` 和 PKCE 校验
- 图片上传做了类型与大小限制

## 13. 常见问题排查

### 13.1 登录后提示不在白名单

原因：

- 当前 GitHub 账号不在 `GITHUB_ADMIN_USERS`

处理：

- 检查环境变量里填写的 GitHub 用户名
- 注意大小写不敏感，但不要写错账号

### 13.2 GitHub OAuth 回调失败

原因：

- `GITHUB_OAUTH_REDIRECT_URI` 和 GitHub OAuth App 配置不一致
- `Client ID / Client Secret` 填错
- 回调域名不是当前实际访问域名

处理：

- 重新核对 GitHub OAuth App 的 callback URL
- 重新核对 Vercel 环境变量
- 本地和线上最好分别配置各自的回调地址

### 13.3 写回返回 403

原因：

- `GITHUB_TOKEN` 权限不足
- Token 无法访问当前仓库

处理：

- 确认使用 Fine-grained token
- 确认仓库权限里有 `Contents: Read and write`
- 确认 `GITHUB_OWNER / GITHUB_REPO` 正确

### 13.4 返回 sha 冲突 / 409

原因：

- 你保存前，仓库里的 `data/prompts.json` 已被其他人改过

处理：

1. 刷新页面
2. 重新加载最新数据
3. 再次合并你的修改后重试

### 13.5 图片上传成功但首页没马上显示

原因：

- 图片已 commit 到 GitHub，但当前 Vercel 静态部署还没切到新版本

处理：

- 前端会先走静态路径，再自动回退到 `/api/image`
- 如果仓库是私有的，也可以依赖 `/api/image` 读取最新图片
- 等待 Vercel 新部署完成后，静态路径会恢复正常

### 13.6 图片上传失败，提示过大

原因：

- 服务端限制为 `<= 2MB`

处理：

- 压缩图片
- 改成 webp

### 13.7 本地开发接口 404

原因：

- 没有用 `npm run dev`
- 只启动了纯 `vite`

处理：

- 用项目里的命令 `npm run dev`
- 它会同时起前端和本地 API server

### 13.8 导入 JSON 失败

原因：

- `schemaVersion` 不等于 `1`
- 字段缺失
- Prompt 的 `categoryId` 指向了不存在的分类

处理：

- 用导出的 JSON 作为模板来修改
- 保证分类先存在

### 13.9 CORS 问题

正常部署到同一个 Vercel 项目时，不需要自己处理 CORS，因为前端和 `/api` 同域。

只有你把前端和 API 拆到不同域名时，才需要额外加 CORS 头。

## 14. 后续可选增强

你可以基于当前项目继续扩展：

- 改用 GitHub App 替代长期 PAT
- 引入 Cloudinary / S3 作为图片存储
- Prompt 历史版本对比
- 删除 Prompt 时自动清理仓库旧图
- 多管理员审计日志
- Cloudflare Access 或 Tailscale 作为第二层访问控制

## 15. 许可证与使用建议

这是一个适合个人 / 小团队内部维护 Prompt 资产的轻量工具站模板。

如果你的图片量级很大、更新非常频繁，建议把图片切到对象存储，把 GitHub 持久化主要用于 `prompts.json` 和配置文件。
