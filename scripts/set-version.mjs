import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const rawVersion = process.argv[2];

if (!rawVersion) {
  console.error("Usage: npm run version:set -- v0.2.1");
  process.exit(1);
}

const version = rawVersion.trim().replace(/^v/i, "");

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid version: ${rawVersion}`);
  process.exit(1);
}

function readText(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function writeText(relativePath, content) {
  writeFileSync(join(repoRoot, relativePath), content, "utf8");
}

function updateJsonVersion(relativePath, updater = (json) => json) {
  const json = JSON.parse(readText(relativePath));
  json.version = version;
  updater(json);
  writeText(relativePath, `${JSON.stringify(json, null, 2)}\n`);
}

function replaceRequired(relativePath, pattern, replacement) {
  const content = readText(relativePath);

  if (!pattern.test(content)) {
    throw new Error(`No version match found in ${relativePath}`);
  }

  const nextContent = content.replace(pattern, replacement);
  writeText(relativePath, nextContent);
}

updateJsonVersion("package.json");
updateJsonVersion("package-lock.json", (json) => {
  if (json.packages?.[""]) {
    json.packages[""].version = version;
  }
});

replaceRequired(
  "src-tauri/tauri.conf.json",
  /("version"\s*:\s*")[^"]+(")/,
  (_match, before, after) => `${before}${version}${after}`,
);

replaceRequired(
  "src-tauri/Cargo.toml",
  /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/,
  (_match, before, after) => `${before}${version}${after}`,
);

replaceRequired(
  "src-tauri/Cargo.lock",
  /(\[\[package\]\]\s*\nname = "cyan-notepad"\s*\nversion = ")[^"]+(")/,
  (_match, before, after) => `${before}${version}${after}`,
);

replaceRequired(
  "src/components/Settings/AboutModal.tsx",
  /(const APP_VERSION = ")[^"]+(";)/,
  (_match, before, after) => `${before}${version}${after}`,
);

console.log(`Version set to v${version}`);
