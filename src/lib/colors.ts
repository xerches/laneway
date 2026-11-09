/** The named colors used for workspaces, projects and statuses. */
export const COLORS = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "violet",
  "pink",
] as const;

export type ColorName = (typeof COLORS)[number];

export function isColor(value: string): value is ColorName {
  return (COLORS as readonly string[]).includes(value);
}

/** CSS color for a named color, e.g. for a solid status pill. */
export function colorVar(name: string): string {
  return `var(--c-${isColor(name) ? name : "gray"})`;
}

/** Readable text color on top of the solid color. */
export function colorFg(name: string): string {
  return `var(--c-${isColor(name) ? name : "gray"}-fg)`;
}

/** A soft tint of the color for backgrounds. */
export function colorSoft(name: string): string {
  return `color-mix(in oklab, ${colorVar(name)} 14%, var(--surface))`;
}

export function randomColor(exclude: string[] = []): ColorName {
  const pool = COLORS.filter((c) => c !== "gray" && !exclude.includes(c));
  const list = pool.length ? pool : COLORS.filter((c) => c !== "gray");
  return list[Math.floor(Math.random() * list.length)];
}
