"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Light, dark, or follow the system. The choice is kept per device in
 * localStorage and applied as data-theme on <html>; globals.css does the rest.
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

/**
 * Runs before the page paints, so a chosen theme never flashes the other one.
 * Kept tiny and static: it only reads one localStorage key.
 */
export function ThemeScript() {
  const code = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
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
