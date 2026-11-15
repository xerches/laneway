/**
 * Links an item may point at. Only these schemes are allowed, so a saved link
 * can never run script when it is clicked.
 */
const SAFE_SCHEMES = ["https:", "http:", "obsidian:", "mailto:"];

export function isSafeLink(value: string): boolean {
  try {
    const url = new URL(value);
    return SAFE_SCHEMES.includes(url.protocol);
  } catch {
    return false;
  }
}

/** Accepts "example.com/page" as well as full addresses. */
export function normalizeLink(value: string): string {
  const trimmed = value.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export type LinkKind = "obsidian" | "github" | "mail" | "web";

export function linkKind(value: string): LinkKind {
  if (value.startsWith("obsidian:")) return "obsidian";
  if (value.startsWith("mailto:")) return "mail";
  try {
    const host = new URL(value).hostname;
    if (host === "github.com" || host.endsWith(".github.com")) return "github";
  } catch {
    // fall through
  }
  return "web";
}

/** A short, readable name for a link that has no title. */
export function linkLabel(value: string, title?: string): string {
  if (title) return title;
  if (value.startsWith("obsidian:")) {
    try {
      const file = new URL(value).searchParams.get("file");
      if (file) return file.split("/").pop() ?? file;
    } catch {
      // fall through
    }
    return "Obsidian note";
  }
  if (value.startsWith("mailto:")) return value.slice("mailto:".length);
  try {
    const url = new URL(value);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return value;
  }
}
