import type { CSSProperties, ReactNode } from "react";
import { colorFg, colorSoft, colorVar } from "@/lib/colors";
import { cn, initials } from "@/lib/utils";

/** A solid, colorful label. Used for statuses, the Monday.com way. */
export function Pill({
  color,
  children,
  className,
  soft,
}: {
  color: string;
  children: ReactNode;
  className?: string;
  soft?: boolean;
}) {
  const style: CSSProperties = soft
    ? { background: colorSoft(color), color: `color-mix(in oklab, ${colorVar(color)} 70%, var(--text))` }
    : { background: colorVar(color), color: colorFg(color) };
  return (
    <span
      style={style}
      className={cn(
        "inline-flex h-6 max-w-full items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ background: colorVar(color) }}
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
    />
  );
}

const AVATAR_COLORS = ["blue", "violet", "teal", "pink", "orange", "indigo", "green"];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  id,
  size = 24,
  className,
}: {
  name: string;
  id?: string;
  size?: number;
  className?: string;
}) {
  const color = AVATAR_COLORS[hash(id ?? name) % AVATAR_COLORS.length];
  return (
    <span
      title={name}
      style={{
        background: colorVar(color),
        color: colorFg(color),
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.42)),
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-sans text-[11px] text-muted">
      {children}
    </kbd>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {body ? <p className="max-w-sm text-[13px] text-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
