"use client";

import { useSyncExternalStore } from "react";
import { todayString } from "./dates";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Same shape as the server's ids, so new items can be shown before they are saved. */
export function clientId(length = 14): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

function subscribeToMidnight(onChange: () => void) {
  // Re-check when the tab regains focus, so "today" rolls over after midnight.
  window.addEventListener("focus", onChange);
  return () => window.removeEventListener("focus", onChange);
}

/**
 * Today's date in the viewer's time zone, or null while the page is still
 * arriving from the server (which doesn't know the viewer's time zone).
 */
export function useToday(): string | null {
  return useSyncExternalStore(subscribeToMidnight, todayString, () => null);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}
