"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Light, dark, or follow the system, plus an accent color and a dark
 * background. Each choice is kept per device in localStorage and applied as an
 * attribute on <html> (data-theme, data-accent, data-dark); globals.css does
 * the rest.
 */

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "laneway:theme";
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Private browsing: the choice lasts until the page reloads.
  }
  apply(choice);
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    apply(read());
    fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme(): ThemeChoice {
  return useSyncExternalStore(subscribe, read, () => "system");
}

/** An accent color, and the background used in dark mode. Kept per device. */
export const ACCENTS = [
  { value: "indigo", label: "Indigo", swatch: "#5046e5" },
  { value: "blue", label: "Blue", swatch: "#1d6fe0" },
  { value: "teal", label: "Teal", swatch: "#0b7c78" },
  { value: "green", label: "Green", swatch: "#14804f" },
  { value: "orange", label: "Orange", swatch: "#c4500f" },
  { value: "pink", label: "Pink", swatch: "#c22f7d" },
  { value: "violet", label: "Violet", swatch: "#7c3aed" },
] as const;

export const DARK_BACKGROUNDS = [
  { value: "graphite", label: "Graphite", swatch: "#181b20", hint: "Soft gray" },
  { value: "midnight", label: "Midnight", swatch: "#121a2b", hint: "Deep blue" },
  { value: "black", label: "Black", swatch: "#0c0d0f", hint: "Darkest, good on OLED screens" },
] as const;

export type AccentChoice = (typeof ACCENTS)[number]["value"];
export type DarkChoice = (typeof DARK_BACKGROUNDS)[number]["value"];

/** A setting kept in localStorage and mirrored as an attribute on <html>. */
function preference<T extends string>(key: string, attribute: string, fallback: T, allowed: readonly T[]) {
  const listeners = new Set<() => void>();
  const read = (): T => {
    try {
      const value = localStorage.getItem(key) as T | null;
      return value && allowed.includes(value) ? value : fallback;
    } catch {
      return fallback;
    }
  };
  const apply = (value: T) => {
    const root = document.documentElement;
    if (value === fallback) root.removeAttribute(attribute);
    else root.setAttribute(attribute, value);
  };
  const set = (value: T) => {
    try {
      if (value === fallback) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Private browsing: the choice lasts until the page reloads.
    }
    apply(value);
    listeners.forEach((fn) => fn());
  };
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      apply(read());
      fn();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(fn);
      window.removeEventListener("storage", onStorage);
    };
  };
  return { read, set, subscribe, fallback };
}

const accentPref = preference<AccentChoice>(
  "laneway:accent",
  "data-accent",
  "indigo",
  ACCENTS.map((a) => a.value),
);
const darkPref = preference<DarkChoice>(
  "laneway:dark",
  "data-dark",
  "graphite",
  DARK_BACKGROUNDS.map((d) => d.value),
);

export const setAccent = accentPref.set;
export const setDarkBackground = darkPref.set;

export function useAccent(): AccentChoice {
  return useSyncExternalStore(accentPref.subscribe, accentPref.read, () => accentPref.fallback);
}

export function useDarkBackground(): DarkChoice {
  return useSyncExternalStore(darkPref.subscribe, darkPref.read, () => darkPref.fallback);
}

/**
 * Runs before the page paints, so chosen colors never flash the defaults.
 * Kept tiny and static: it only reads three localStorage keys.
 */
export function ThemeScript() {
  const accents = JSON.stringify(ACCENTS.map((a) => a.value));
  const darks = JSON.stringify(DARK_BACKGROUNDS.map((d) => d.value));
  const code =
    `try{var d=document.documentElement,s=localStorage,t=s.getItem("${KEY}");` +
    `if(t==="light"||t==="dark")d.setAttribute("data-theme",t);` +
    `var a=s.getItem("laneway:accent");if(${accents}.indexOf(a)>0)d.setAttribute("data-accent",a);` +
    `var k=s.getItem("laneway:dark");if(${darks}.indexOf(k)>0)d.setAttribute("data-dark",k)}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Three small buttons: Light, Dark, System. */
export function ThemeSwitch({ className }: { className?: string }) {
  const theme = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={cn("flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5", className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "flex h-6 flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium transition-colors",
            theme === value
              ? "bg-surface text-ink shadow-card"
              : "text-faint hover:text-ink",
          )}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Toasts that match the chosen theme. */
export function ThemedToaster() {
  const theme = useTheme();
  return <Toaster position="bottom-right" theme={theme} richColors closeButton />;
}
