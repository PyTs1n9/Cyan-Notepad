/**
 * `@tauri-apps/api/path` stand-in.
 *
 * `resourceDir()` is pointed at `<sandbox>/src-tauri/target/debug`, which is the
 * shape `resolveLocalProjectDataDirectory()` looks for in dev, so the data root
 * under test becomes `<sandbox>/data` without touching the real repo data.
 */
import path from "node:path";

export const sandboxRoot = process.env.VERIFY_SANDBOX || path.join(process.cwd(), ".verify-sandbox");

export async function join(...parts: string[]): Promise<string> {
  return path.join(...parts);
}

export async function resourceDir(): Promise<string> {
  return path.join(sandboxRoot, "src-tauri", "target", "debug");
}
