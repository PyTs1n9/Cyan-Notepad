/**
 * Bundles `run.ts` with the Tauri modules swapped for the mocks in this folder.
 *
 * esbuild is the only bundler available here (Vite ships it), and its `alias`
 * option cannot express "`@/` means `src/`" without also catching `@tauri-apps/*`,
 * so the mapping is done with a resolve plugin instead.
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const outfile = path.join(os.tmpdir(), "qing-notepad-verify-batch2.mjs");

/** Resolve `src/...` the way Vite does: exact, .ts, .tsx, then /index.ts. */
function resolveSource(specifier) {
  const base = path.join(root, "src", specifier.replace(/^@\//, ""));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return base;
}

await esbuild.build({
  entryPoints: [path.join(here, "run.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile,
  logLevel: "warning",
  // dev-mode resolution: storage.ts looks for `src-tauri/target/debug` under
  // resourceDir() to find the project data directory.
  define: { "import.meta.env.PROD": "false" },
  plugins: [{
    name: "tauri-mocks",
    setup(build) {
      build.onResolve({ filter: /^@tauri-apps\/plugin-fs$/ }, () => ({ path: path.join(here, "tauriFs.ts") }));
      build.onResolve({ filter: /^@tauri-apps\/api\/path$/ }, () => ({ path: path.join(here, "tauriPath.ts") }));
      build.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({ path: path.join(here, "tauriCore.ts") }));
      build.onResolve({ filter: /^@\// }, (args) => ({ path: resolveSource(args.path) }));
    },
  }],
});

console.log(`built ${outfile}`);

// `--run` keeps the two steps behind one npm script.
if (process.argv.includes("--run")) {
  await import(`file://${outfile.replace(/\\/g, "/")}`);
}
