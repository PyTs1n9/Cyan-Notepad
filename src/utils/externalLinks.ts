import { openUrl } from "@tauri-apps/plugin-opener";
import type { MouseEvent as ReactMouseEvent } from "react";

type LinkClickEvent = MouseEvent | ReactMouseEvent<HTMLElement>;

const WEB_PROTOCOLS = new Set(["http:", "https:"]);

function normalizeWebUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    return WEB_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export async function openInDefaultBrowser(rawUrl: string): Promise<boolean> {
  const url = normalizeWebUrl(rawUrl);
  if (!url) return false;
  await openUrl(url);
  return true;
}

export function handleExternalLinkClick(event: LinkClickEvent) {
  const target = event.target as Element | null;
  const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
  const currentTarget = event.currentTarget as Element | null;
  if (!anchor || (currentTarget && !currentTarget.contains(anchor))) return;

  const url = normalizeWebUrl(anchor.href || anchor.getAttribute("href") || "");
  if (!url) return;

  event.preventDefault();
  event.stopPropagation();

  openUrl(url).catch((error) => {
    console.error("Failed to open link in default browser:", error);
  });
}
