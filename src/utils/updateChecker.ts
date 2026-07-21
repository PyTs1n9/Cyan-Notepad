import packageJson from "../../package.json";

export const APP_VERSION = packageJson.version;
export const GITHUB_URL = "https://github.com/PyTs1n9/Cyan-Notepad";
export const GITHUB_RELEASES_URL = `${GITHUB_URL}/releases`;

const GITHUB_API_LATEST = "https://api.github.com/repos/PyTs1n9/Cyan-Notepad/releases/latest";

interface ParsedVersion {
  numbers: [number, number, number];
  prerelease: string[];
}

export interface LatestRelease {
  version: string;
  url: string;
}

function parseVersion(version: string): ParsedVersion | null {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/i);
  if (!match) return null;

  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? [],
  };
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
    if (leftNumber !== null && rightNumber !== null) return leftNumber > rightNumber ? 1 : -1;
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return leftPart > rightPart ? 1 : -1;
  }

  return 0;
}

export function isVersionNewer(candidate: string, current: string): boolean {
  const candidateVersion = parseVersion(candidate);
  const currentVersion = parseVersion(current);
  if (!candidateVersion || !currentVersion) return false;

  for (let index = 0; index < candidateVersion.numbers.length; index += 1) {
    const difference = candidateVersion.numbers[index] - currentVersion.numbers[index];
    if (difference !== 0) return difference > 0;
  }

  return comparePrerelease(candidateVersion.prerelease, currentVersion.prerelease) > 0;
}

export async function fetchLatestRelease(): Promise<LatestRelease> {
  const response = await fetch(GITHUB_API_LATEST, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

  const data = await response.json() as { tag_name?: unknown; html_url?: unknown };
  const version = typeof data.tag_name === "string" ? data.tag_name.trim().replace(/^v/i, "") : "";
  if (!parseVersion(version)) throw new Error("GitHub release has an invalid version tag");

  return {
    version,
    url: typeof data.html_url === "string" && data.html_url ? data.html_url : GITHUB_RELEASES_URL,
  };
}
