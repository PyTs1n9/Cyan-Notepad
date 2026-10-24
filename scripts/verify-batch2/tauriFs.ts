/**
 * `@tauri-apps/plugin-fs` stand-in for the headless verification harness.
 *
 * Mirrors the real API surface `src/utils/storage.ts` uses, on top of Node's fs.
 * Every call is counted and its path recorded, which is what makes it possible to
 * assert "the boot path read only one note body" without a running webview.
 */
import fsp from "node:fs/promises";
import path from "node:path";

export const calls = {
  readTextFile: [] as string[],
  readFile: [] as string[],
  writeTextFile: [] as string[],
  readDir: [] as string[],
  rename: [] as string[],
  remove: [] as string[],
  stat: [] as string[],
};

export function resetCalls(): void {
  for (const key of Object.keys(calls) as (keyof typeof calls)[]) calls[key].length = 0;
}

export async function readTextFile(file: string): Promise<string> {
  calls.readTextFile.push(file);
  return fsp.readFile(file, "utf8");
}

export async function writeTextFile(file: string, contents: string): Promise<void> {
  calls.writeTextFile.push(file);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, contents, "utf8");
}

export async function readFile(file: string): Promise<Uint8Array> {
  calls.readFile.push(file);
  return new Uint8Array(await fsp.readFile(file));
}

export async function writeFile(file: string, contents: Uint8Array): Promise<void> {
  calls.writeTextFile.push(file);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, contents);
}

export async function exists(file: string): Promise<boolean> {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function mkdir(dir: string, options?: { recursive?: boolean }): Promise<void> {
  await fsp.mkdir(dir, { recursive: options?.recursive ?? false });
}

export async function remove(file: string, options?: { recursive?: boolean }): Promise<void> {
  calls.remove.push(file);
  await fsp.rm(file, { recursive: options?.recursive ?? false });
}

export async function readDir(dir: string) {
  calls.readDir.push(dir);
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
  }));
}

export async function rename(from: string, to: string): Promise<void> {
  calls.rename.push(`${from} -> ${to}`);
  await fsp.rename(from, to);
}

export async function stat(file: string) {
  calls.stat.push(file);
  const info = await fsp.stat(file);
  return {
    size: info.size,
    mtime: info.mtime,
    isFile: info.isFile(),
    isDirectory: info.isDirectory(),
  };
}
