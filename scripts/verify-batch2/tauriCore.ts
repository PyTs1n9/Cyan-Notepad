/** `@tauri-apps/api/core` stand-in: no IPC and no custom data directory here. */
export function isTauri(): boolean {
  return false;
}

export async function invoke(command: string): Promise<never> {
  throw new Error(`invoke("${command}") is unavailable in the harness`);
}

export function convertFileSrc(filePath: string): string {
  return `http://asset.localhost/${encodeURIComponent(filePath)}`;
}
