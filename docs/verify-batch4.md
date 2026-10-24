# 批次 4 验证报告（协作服务器鉴权加固）

日期：2026-10-24　范围：`docs/prompts-fix-performance-security.md` 批次 4（P1-5）
改动面：仅 `collab-server/src/index.ts`。未动前端、未动 `supabase/migrations`、未连线上库。

## 1. 结论

| 项 | 状态 |
| --- | --- |
| 代码 | 已落地 |
| 自动化验证 | **23/23 行为断言通过**（`npm run verify:batch4`） |
| 类型检查 | 根 `tsc` 0 错误、collab-server `tsc` 0 错误 |
| 构建 | `npm run build`（collab-server）→ `dist/index.js` 18 KB |
| 真机/部署验证 | 需要（见第 5 节），本机不可替代 |

## 2. 复核结论

四条都成立，且比原描述多一处：

1. `onAuthenticate` 每次连接 `createClient()` 新建 Supabase 客户端 → 成立（原 208-210 行）。
2. `getUser` 无缓存、无速率限制 → 成立。
3. **`onTokenSync` 也在重复查询**：它用 `admin.auth.getUser(token)`（service-role client），每次
   token 刷新打一次 Auth。原提示词只要求"顺手确认"，实测确认为真，已一并收进同一缓存。
4. 错误直出：`throw documentError || memberError` 把 Supabase 原始错误（含表名、policy、code）抛给客户端 → 成立。

**P1-4（RLS 未校验 access_level）确认已撤回**：`202607220003_document_access_permissions.sql:312-358`
的三条 policy（`documents_select_member` / `documents_update_editor` / `documents_delete_editor`）都按
`access_level` 收紧，`documents_insert_editor`（317-329）也限制 editor 只能建 `managers`/`members`。
未产出任何 SQL。

## 3. 改动点

| 结构 | 键 | 值 | 上限 | 清理 |
| --- | --- | --- | --- | --- |
| `anon` client | — | 模块级单例 | — | 进程生命周期 |
| `verifiedTokens` | token | `{userId, expiresAt}`，TTL 60s | 1000 | 惰性过期 + 60s sweep + 满时淘汰最早插入（固定 TTL ⇒ 插入序即过期序） |
| `blockedTokens` | token | 冷却截止时间戳，5 分钟 | 5000 | 惰性过期 + 60s sweep + 满时淘汰最早插入 |
| `verifications` | token | 在飞的 Promise | 受闸门约束 | settle 时删除（`finally`，且只删自己那条） |

- **全局并发闸门**：同时在飞的 `getUser` ≤ 20，超出直接返回
  `Sign-in is busy right now, try again in a moment`，且不占用 Auth 配额。**不按 IP**
  （Render 反向代理下 `remoteAddress` 不可信）。
- **失败冷却**：`getUser` 返回 400/401/403 视为凭据被拒 → 该 token 冷却 5 分钟，期间直接拒绝、不再请求 Auth。
  网络类错误（status 0/5xx）**不进冷却**，否则 Supabase 抖动会误锁正常用户。
- **单飞（提示词未要求，测试逼出来的）**：同一 token 的并发握手共享一次 `getUser`。
  没有它时，5 个同时到达的握手会各自占一个闸门槽位、各打一次 Auth —— 恰恰是最容易被刷的形态。
- **错误文案**：对外统一 `Invalid or expired session` / `Too many failed sign-in attempts, try again later` /
  `Unable to verify document access`；表名、policy、错误码只进 `console.error`。
- **身份断言保留**：`onTokenSync` 缓存命中后仍校验 `verifyAccessToken(token) === context.userId`，
  缓存只证明 token 有效，不代替"这个 token 属于这个连接"。
- **鉴权改走 anon**：`getUser(jwt)` 的 JWT 走 Authorization 头，client key 只作 apikey，
  所以 anon 足够；service-role 从此不出现在鉴权路径上。
- `authSweep` 定时器 `.unref()`，不拖住进程退出。

## 4. 自动化验证（9 组 23 条）

`scripts/verify-batch4/run.mjs`：用 esbuild 把真实的 `collab-server/src/index.ts` 打包，
把 `@hocuspocus/server`、`@hocuspocus/extension-database`、`@supabase/supabase-js` 换成 stub，
再直接驱动捕获到的 `onAuthenticate` / `onTokenSync`。不监听端口、不连任何 Supabase 项目。

| 组 | 断言 |
| --- | --- |
| 缓存 | 同 token 5 次并发连接 → Auth 只调 1 次；鉴权只走 anon |
| 跨 handler | `onTokenSync` 复用同一缓存，不额外调用 |
| 身份 | 缓存里属于别人的 token → `Invalid refreshed session` |
| TTL | 拨快 61s 后重新校验 |
| 冷却 | 401 首次给统一文案、第二次进冷却、冷却期间不再请求 Auth、原始错误不外泄 |
| 暂时性失败 | 网络错误不冷却，会再次尝试 |
| 泄露 | 查询失败对外是统一文案，表名/错误码只在日志里 |
| 闸门 | 20 个在飞 + 第 21 个被挡（且未打到 Auth）、20 个全部成功、放行后恢复 |
| 上限 | 1001 个 token → 最早一条被淘汰（需重新校验）、最后一条仍在 |

## 5. 必须部署后人工验证

1. Render 部署后用客户端反复断开/重连 20 次：正常用户不受影响，异常重连被闸门挡住。
2. 观察 Supabase Auth 请求曲线：不再随连接数线性上涨（同一 token 60s 内只应看到一次 `/auth/v1/user`）。
3. 正常编辑协作：刷新 token 后连接不断（`onTokenSync` 走缓存但仍过身份断言）。
4. 权限被撤销时的行为不变：`documents`/`workspace_members` 的实时订阅仍会断开连接。

## 6. 未做

- 未改前端、未改 `supabase/migrations`、未产出 SQL、未连线上库、未跑 `npm install`。
- 未做按 IP 限流（提示词明确要求不要，理由见第 3 节）。
- 未接监控/告警（报告里只提到"记录失败率"，本轮以日志形式落地，未接 metrics）。
