/**
 * Headless verification for batch 4 (collaboration auth cache / throttle).
 *
 * Bundles the real `collab-server/src/index.ts` with `@hocuspocus/server`,
 * `@hocuspocus/extension-database` and `@supabase/supabase-js` replaced by the
 * stubs in `./stubs`, then drives the captured `onAuthenticate` / `onTokenSync`
 * handlers. No port is bound and no Supabase project is touched.
 *
 *   npm run verify:batch4
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const ROOM = `${WORKSPACE_ID}:${DOCUMENT_ID}`;

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_ANON_KEY ??= "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-key";

let checks = 0;
let failures = 0;

function check(name, ok, detail) {
  checks += 1;
  if (ok) {
    console.log(`  PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

const section = (title) => console.log(`\n${title}`);

// ---------------------------------------------------------------- supabase stub
let authCalls = [];
const logged = [];
let getUserImpl = async (_kind, token) => ({
  data: { user: { id: `user-of-${token}` } },
  error: null,
});
let queryImpl = () => ({ single: null, list: [] });

globalThis.__supabase = {
  getUser(kind, token) {
    authCalls.push({ kind, token });
    return getUserImpl(kind, token);
  },
  query(table) {
    return queryImpl(table);
  },
};

const defaultRows = (table) => {
  if (table === "documents") return { data: { workspace_id: WORKSPACE_ID, access_level: "members" }, error: null };
  if (table === "workspace_members") return { data: { role: "editor" }, error: null };
  return { data: null, error: null };
};
queryImpl = (table) => ({ single: defaultRows(table), list: [] });

const callsFor = (token) => authCalls.filter((call) => call.token === token).length;
const authKinds = () => [...new Set(authCalls.map((call) => call.kind))];

// ---------------------------------------------------------------- bundle
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "collab-verify-"));
const outfile = path.join(tmpDir, "index.bundle.mjs");
await esbuild.build({
  entryPoints: [path.join(root, "collab-server/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile,
  logLevel: "silent",
  // `dotenv` (and yjs' CJS build) call `require` at runtime; the bundle is ESM,
  // so hand them a real one instead of esbuild's throwing shim.
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);',
  },
  plugins: [{
    name: "stub-collaboration-deps",
    setup(build) {
      build.onResolve({ filter: /^@hocuspocus\/server$/ }, () => ({
        path: path.join(here, "stubs/hocuspocus-server.mjs"),
      }));
      build.onResolve({ filter: /^@hocuspocus\/extension-database$/ }, () => ({
        path: path.join(here, "stubs/hocuspocus-database.mjs"),
      }));
      build.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({
        path: path.join(here, "stubs/supabase-js.mjs"),
      }));
    },
  }],
});

// Release the esbuild service before the bundle takes over the process.
await esbuild.stop?.();

const realConsoleError = console.error;
console.error = (...args) => {
  logged.push(args.map((item) => {
    if (typeof item === "string") return item;
    if (item instanceof Error) return item.message;
    try {
      return JSON.stringify(item);
    } catch {
      return String(item);
    }
  }).join(" "));
};

await import(pathToFileURL(outfile).href);
await new Promise((resolve) => setTimeout(resolve, 20));

const options = globalThis.__collabOptions;
const onAuthenticate = options?.onAuthenticate;
const onTokenSync = options?.onTokenSync;

check("bundle 捕获到 onAuthenticate / onTokenSync", typeof onAuthenticate === "function" && typeof onTokenSync === "function");

const authenticate = (token) => onAuthenticate({
  token,
  documentName: ROOM,
  connectionConfig: {},
});
const syncToken = (token, userId) => onTokenSync({
  token,
  context: { userId, workspaceId: WORKSPACE_ID, documentId: DOCUMENT_ID, role: "editor" },
  connectionConfig: {},
});

const expectReject = async (promise) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error.message;
  }
};

// ---------------------------------------------------------------- [1] cache
section("[1] getUser 结果短 TTL 缓存");
authCalls = [];
const firstFive = await Promise.all([1, 2, 3, 4, 5].map(() => authenticate("token-a")));
check("同一 token 连续 5 次连接全部成功", firstFive.every((result) => result.userId === "user-of-token-a"));
check("Auth 只被调用 1 次（其余命中缓存）", callsFor("token-a") === 1, callsFor("token-a"));
check("鉴权走 anon client，不再用 service-role",
  authKinds().length === 1 && authKinds()[0] === "anon", authKinds());

section("[2] onTokenSync 与 onAuthenticate 共用同一份缓存");
const synced = await syncToken("token-a", "user-of-token-a");
check("刷新后的 token 仍能通过", synced.userId === "user-of-token-a");
check("没有额外调用 Auth", callsFor("token-a") === 1, callsFor("token-a"));

section("[3] 缓存命中仍要过身份断言");
await authenticate("token-b");
const wrongUser = await expectReject(syncToken("token-b", "user-of-token-a"));
check("缓存里的 token 属于别人时被拒", wrongUser === "Invalid refreshed session", wrongUser);

section("[4] TTL 到期后重新校验");
const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
clockOffset = 61_000;
await authenticate("token-a");
check("61 秒后再连接会重新调用 Auth", callsFor("token-a") === 2, callsFor("token-a"));
clockOffset = 0;
Date.now = realNow;

// ---------------------------------------------------------------- [5] abuse
section("[5] 被拒的 token 进 5 分钟冷却");
getUserImpl = async (_kind, token) => {
  if (token === "token-revoked") {
    return { data: { user: null }, error: { status: 401, message: "invalid JWT: signature mismatch" } };
  }
  return { data: { user: { id: `user-of-${token}` } }, error: null };
};
const firstReject = await expectReject(authenticate("token-revoked"));
const secondReject = await expectReject(authenticate("token-revoked"));
check("首次拒绝给统一文案", firstReject === "Invalid or expired session", firstReject);
check("重复撞库立即进冷却", secondReject === "Too many failed sign-in attempts, try again later", secondReject);
check("冷却期间不再请求 Auth", callsFor("token-revoked") === 1, callsFor("token-revoked"));
check("Supabase 原始错误没有回传给客户端",
  !String(firstReject).includes("signature") && !String(secondReject).includes("signature"));

section("[6] 网络类失败不占用冷却额度");
getUserImpl = async (_kind, token) => {
  if (token === "token-flaky") return { data: { user: null }, error: { status: 0, message: "fetch failed" } };
  return { data: { user: { id: `user-of-${token}` } }, error: null };
};
await expectReject(authenticate("token-flaky"));
await expectReject(authenticate("token-flaky"));
check("暂时性失败会再次尝试（不会锁死正常用户）", callsFor("token-flaky") === 2, callsFor("token-flaky"));

// ---------------------------------------------------------------- [7] leak
section("[7] 数据库错误不泄露给客户端");
getUserImpl = async (_kind, token) => ({ data: { user: { id: `user-of-${token}` } }, error: null });
queryImpl = (table) => {
  if (table === "documents") {
    return {
      single: { data: null, error: { message: "permission denied for table documents", code: "42501" } },
      list: [],
    };
  }
  return { single: defaultRows(table), list: [] };
};
const leaked = await expectReject(authenticate("token-db"));
check("对外是统一文案", leaked === "Unable to verify document access", leaked);
check("文案里没有表名/策略名", !String(leaked).includes("documents") && !String(leaked).includes("42501"));
check("细节只进服务端日志",
  logged.some((line) => line.includes("permission denied for table documents")),
  logged.slice(-2));
queryImpl = (table) => ({ single: defaultRows(table), list: [] });

// ---------------------------------------------------------------- [8] gate
section("[8] 全局并发闸门（不按 IP）");
getUserImpl = async () => ({ data: { user: { id: "user-of-concurrent" } }, error: null });
const pending = [];
getUserImpl = (_kind, token) => new Promise((resolve) => {
  pending.push({ token, resolve });
});
const concurrentCalls = Array.from({ length: 20 }, (_, index) => authenticate(`concurrent-${index}`));
await new Promise((resolve) => setTimeout(resolve, 30));
const overflow = await expectReject(authenticate("concurrent-overflow"));
check("第 21 个并发请求被闸门挡住", overflow === "Sign-in is busy right now, try again in a moment", overflow);
check("被挡的请求没有打到 Auth", callsFor("concurrent-overflow") === 0);
for (const item of pending) {
  item.resolve({ data: { user: { id: `user-of-${item.token}` } }, error: null });
}
const settled = await Promise.allSettled(concurrentCalls);
check("在飞的 20 个全部成功", settled.every((item) => item.status === "fulfilled"),
  settled.filter((item) => item.status === "rejected").length);
getUserImpl = async (_kind, token) => ({ data: { user: { id: `user-of-${token}` } }, error: null });
const afterGate = await authenticate("token-after-gate");
check("闸门放行后恢复正常", afterGate.userId === "user-of-token-after-gate");

// ---------------------------------------------------------------- [9] bounds
section("[9] 缓存上限与淘汰");
getUserImpl = async (_kind, token) => ({ data: { user: { id: `user-of-${token}` } }, error: null });
authCalls = [];
for (let index = 0; index < 1001; index += 1) {
  await authenticate(`bulk-${index}`);
}
check("1001 个 token 各查一次", authCalls.length === 1001, authCalls.length);
await authenticate("bulk-0");
check("最早的一条已被淘汰（需要重新查）", callsFor("bulk-0") === 2, callsFor("bulk-0"));
await authenticate("bulk-1000");
check("最后一条仍在缓存", callsFor("bulk-1000") === 1, callsFor("bulk-1000"));

console.error = realConsoleError;
fs.rmSync(tmpDir, { recursive: true, force: true });

const summary = `${checks - failures}/${checks} checks passed`;
console.log(`\n${failures === 0 ? "ALL PASS" : "FAILED"} — ${summary}`);
if (failures > 0) process.exitCode = 1;
// The bundled server registers its own timers; do not wait for them.
process.exit(failures === 0 ? 0 : 1);
