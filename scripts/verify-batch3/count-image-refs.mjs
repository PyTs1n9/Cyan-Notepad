/** Count image reference shapes in the live note files (read-only). */
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] ?? "data/notes";
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".md")) files.push(full);
  }
};
if (!fs.existsSync(root)) {
  console.log(`no such directory: ${root}`);
  process.exit(0);
}
walk(root);

const stats = { attachment: 0, relative: 0, absolute: 0, remote: 0, other: 0 };
const offenders = new Map();
const pattern = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/g;
const isAbsolute = (value) => /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value);

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const source = (match[1] ?? match[2]).trim();
    let kind = "other";
    if (/^attachment:\/\//i.test(source)) kind = "attachment";
    else if (/^(?:https?:|data:|blob:|asset:)/i.test(source)) kind = "remote";
    else if (isAbsolute(source)) kind = "absolute";
    else if (source) kind = "relative";
    stats[kind] += 1;
    if (kind === "absolute" || kind === "relative") {
      const count = (offenders.get(file) ?? 0) + 1;
      offenders.set(file, count);
    }
  }
}

console.log(`md files: ${files.length}`);
console.log(stats);
console.log(`notes with non-attachment local refs: ${offenders.size}`);
for (const [file, count] of [...offenders].slice(0, 15)) console.log(`  ${file} (${count})`);
