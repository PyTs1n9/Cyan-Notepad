# 联网工作台部署

## 1. 初始化 Supabase

在 Supabase SQL Editor 中完整执行：

```text
supabase/migrations/202607190001_workspaces.sql
```

该迁移会创建用户资料、工作台、成员、文档、Yjs 状态表、邀请码函数、Realtime publication 和 RLS 策略。

## 2. 本地启动协作服务

复制 `collab-server/.env.example` 为 `collab-server/.env`，填写 Supabase 的服务器 Secret key（或旧版 `service_role` key）。该密钥不能提交到 Git，也不能放进 EXE。

```powershell
npm.cmd run collab:dev
```

健康检查：`http://127.0.0.1:1234/health`。

## 3. 本地启动桌面应用

根目录 `.env.local` 中需要：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
VITE_COLLAB_URL=ws://127.0.0.1:1234
```

然后运行：

```powershell
. .\env.ps1
npm.cmd run tauri dev
```

## 4. 部署协作服务

仓库根目录的 `render.yaml` 可创建 Docker Web Service。部署时只需要在托管平台手动填写 `SUPABASE_SERVICE_ROLE_KEY`。部署成功后使用服务的 HTTPS 域名生成 WebSocket 地址，例如：

```text
wss://cyan-notepad-collab.example.com
```

## 5. GitHub Release

在 GitHub 仓库的 `Settings → Secrets and variables → Actions → Variables` 创建：

```text
VITE_COLLAB_URL=wss://你的协作服务域名
```

Supabase 的公开 URL 和 publishable key 已由 Release 工作流注入。推送版本 tag 后，安装包会自动连接官方 Supabase 和协作服务。

## 安全边界

- EXE 只包含 Supabase URL、publishable key 和公开 WebSocket URL。
- Secret key/service_role 仅存在于协作服务器环境。
- Hocuspocus 会验证 Supabase JWT，并再次检查工作台成员角色。
- viewer 在客户端与服务器两端均为只读。
- 文档正文通过 Yjs CRDT 合并，服务器定期写入 Yjs 状态和 Markdown 快照。
