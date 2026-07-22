# 联网工作台部署

## 1. 初始化 Supabase

在 Supabase SQL Editor 中按顺序完整执行：

```text
supabase/migrations/202607190001_workspaces.sql
supabase/migrations/202607190002_service_role_grants.sql
supabase/migrations/202607190003_workspace_mutation_rpcs.sql
supabase/migrations/202607190004_realtime_workspaces.sql
supabase/migrations/202607200001_realtime_profiles.sql
supabase/migrations/202607200002_sync_auth_profiles.sql
supabase/migrations/202607200003_workspace_removal_notifications.sql
supabase/migrations/202607220001_scheduled_document_publishing.sql
supabase/migrations/202607220002_document_unpublishing.sql
```

这些迁移会创建用户资料、工作台、成员、文档、Yjs 状态表、邀请码和云文档发布/下架函数、Realtime publication 与 RLS 策略，并让昵称、头像和文档发布状态实时刷新到工作台。

### 配置密码恢复回调

在 Supabase Dashboard 打开 `Authentication → URL Configuration`，将下面的地址加入 Redirect URLs：

```text
cyan-notepad://auth/recovery
```

桌面应用会注册 `cyan-notepad://` 协议。用户点击找回密码邮件后，Supabase 会把恢复会话交回 Cyan Notepad，由应用显示新密码窗口并完成修改。若未加入白名单，Supabase 会回退到 Site URL，链接可能仍然打开网站而不是应用。

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
