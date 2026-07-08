import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const KEEP_BUILD_COUNT = 3;
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const args = process.argv.slice(2);

function readCargoNames() {
  const cargoToml = join(repoRoot, "src-tauri", "Cargo.toml");

  if (!existsSync(cargoToml)) {
    return ["cyan-notepad", "cyan_notepad_lib"];
  }

  const content = readFileSync(cargoToml, "utf8");
  const names = new Set();
  let currentSection = "";

  for (const line of content.split(/\r?\n/)) {
    const sectionMatch = line.match(/^\s*\[([^\]]+)]/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    const nameMatch = line.match(/^\s*name\s*=\s*"([^"]+)"/);
    if (nameMatch && (currentSection === "package" || currentSection === "lib")) {
      names.add(nameMatch[1]);
    }
  }

  return names.size > 0 ? [...names] : ["cyan-notepad", "cyan_notepad_lib"];
}

function pruneOldBuildDirs(keepCount = KEEP_BUILD_COUNT) {
  const debugTarget = join(repoRoot, "src-tauri", "target", "debug");
  const prefixes = readCargoNames().flatMap((name) => [
    `${name}-`,
    `${name.replaceAll("-", "_")}-`,
  ]);
  const dirsToPrune = [
    {
      root: join(debugTarget, "build"),
      prefixes,
    },
    {
      root: join(debugTarget, ".fingerprint"),
      prefixes,
    },
  ];

  for (const { root, prefixes } of dirsToPrune) {
    if (!existsSync(root)) {
      continue;
    }

    const oldDirs = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => prefixes.some((prefix) => entry.name.startsWith(prefix)))
      .map((entry) => {
        const fullPath = join(root, entry.name);
        return {
          name: entry.name,
          fullPath,
          mtimeMs: statSync(fullPath).mtimeMs,
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    for (const dir of oldDirs.slice(keepCount)) {
      rmSync(dir.fullPath, { recursive: true, force: true });
      console.log(`[tauri-cleanup] Removed old build dir: ${dir.fullPath}`);
    }
  }
}

function resolveTauriBin() {
  return join(repoRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
}

if (args[0] === "dev") {
  pruneOldBuildDirs(KEEP_BUILD_COUNT - 1);
}

const child = spawn(process.execPath, [resolveTauriBin(), ...args], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (args[0] === "dev") {
    pruneOldBuildDirs();
  }

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
