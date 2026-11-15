"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small, dependency-free charts for dashboards. Marks carry the entity's own
 * color (a status, priority or label color); every number and name stays in
 * the text colors. Each chart has a hover tooltip and a screen-reader table.
 */

export type BarDatum = {
  key: string;
  label: string;
  value: number;
  color: string;
};

/** Horizontal bars, one row per category, sorted as given. */
export function BarList({
  data,
  total,
  unit = "items",
  empty,
}: {
  data: BarDatum[];
  /** What the percentages are out of. Defaults to the sum of the values. */
  total?: number;
  unit?: string;
  empty: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const sum = total ?? data.reduce((n, d) => n + d.value, 0);

  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <p className="px-4 py-8 text-center text-[13px] text-muted">{empty}</p>
    );
  }

  return (
    <div className="px-4 py-3">
      <ul className="flex flex-col gap-1" aria-hidden>
        {data.map((d) => {
          const pct = sum ? Math.round((d.value / sum) * 100) : 0;
          return (
            <li
              key={d.key}
              onPointerEnter={() => setHover(d.key)}
              onPointerLeave={() => setHover((h) => (h === d.key ? null : h))}
              className={cn(
                "relative grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2.5rem] items-center gap-3 rounded-md px-1 py-1",
                hover === d.key && "bg-surface-2/70",
              )}
            >
              <span className="truncate text-[13px] text-ink">{d.label}</span>
              <span className="flex h-3 items-center">
                <span
                  className="h-3 rounded-r-[4px] rounded-l-[2px]"
                  style={{
                    width: d.value ? `max(4px, ${(d.value / max) * 100}%)` : 0,
                    background: `var(--c-${d.color}, var(--c-gray))`,
                  }}
                />
              </span>
              <span className="text-right text-[13px] font-medium text-ink tabular-nums">
                {d.value}
              </span>
              {hover === d.key ? (
                <Tooltip className="top-[-34px] left-1/2 -translate-x-1/2">
                  <b className="font-semibold">{d.label}</b>: {d.value} {unit} ·{" "}
                  {pct}%
                </Tooltip>
              ) : null}
            </li>
          );
        })}
      </ul>
      <table className="sr-only">
        <thead>
          <tr>
            <th>Category</th>
            <th>{unit}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <td>{d.label}</td>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tooltip({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      role="presentation"
      style={style}
      className={cn(
        "pointer-events-none absolute z-10 rounded-md border border-line bg-surface px-2 py-1 text-xs whitespace-nowrap text-ink shadow-pop",
        className,
      )}
    >
      {children}
    </span>
  );
}

const PAD = { top: 12, right: 12, bottom: 22, left: 28 };

/**
 * The chart's drawing width in CSS pixels, so text and marks stay the same
 * size whether the widget is narrow or wide.
 */
function useWidth(fallback = 520) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Nice round gridline steps for a count axis. */
function ticks(max: number): number[] {
  const top = Math.max(1, max);
  const raw = top / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= top + step * 0.001; v += step) out.push(Math.round(v));
  if (out[out.length - 1] < top)
    out.push(out[out.length - 1] + Math.round(step));
  return out.filter((v, i, a) => a.indexOf(v) === i);
}

export type ColumnDatum = {
  key: string;
  label: string;
  detail: string;
  value: number;
};

/** Vertical columns over time, one series, in the accent color. */
export function ColumnChart({
  data,
  unit,
  height = 180,
}: {
  data: ColumnDatum[];
  unit: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth();
  const grid = ticks(Math.max(...data.map((d) => d.value)));
  const top = grid[grid.length - 1];
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const barW = Math.max(4, Math.min(40, slot * 0.6));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  return (
    <div className="relative px-3 pt-2 pb-3">
      <div ref={ref}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full overflow-visible"
          role="img"
          aria-label={`${unit} per week: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}
          onPointerLeave={() => setHover(null)}
        >
          {grid.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(v)}
                dy="0.32em"
                textAnchor="end"
                className="fill-[var(--text-faint)] text-[11px] tabular-nums"
              >
                {v}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const h = Math.max(d.value ? 3 : 0, (d.value / top) * plotH);
            const x = cx - barW / 2;
            const yTop = PAD.top + plotH - h;
            const r = Math.min(4, h, barW / 2);
            return (
              <g key={d.key} onPointerEnter={() => setHover(i)}>
                {/* Hit target: the whole column slot. */}
                <rect
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill={hover === i ? "var(--surface-2)" : "transparent"}
                />
                {h > 0 ? (
                  <path
                    d={`M${x},${PAD.top + plotH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${PAD.top + plotH} Z`}
                    fill="var(--accent)"
                  />
                ) : null}
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-[var(--text-faint)] text-[11px]"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={PAD.top + plotH}
            y2={PAD.top + plotH}
            stroke="var(--border-strong)"
          />
        </svg>
      </div>
      {hover !== null ? (
        <Tooltip
          className="top-0 -translate-x-1/2"
          style={{
            left: `clamp(70px, ${((PAD.left + slot * hover + slot / 2) / width) * 100}%, calc(100% - 70px))`,
          }}
        >
          <b className="font-semibold">{data[hover].detail}</b>:{" "}
          {data[hover].value} {unit}
        </Tooltip>
      ) : null}
      <table className="sr-only">
        <thead>
          <tr>
            <th>Week</th>
            <th>{unit}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <td>{d.detail}</td>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type LineSeries = {
  key: string;
  name: string;
  color: string;
  dashed?: boolean;
  values: number[];
};

/** Lines over the same days, one count axis, with a crosshair tooltip. */
export function LineChart({
  days,
  dayLabel,
  series,
  height = 200,
}: {
  /** ISO dates, oldest first. */
  days: string[];
  dayLabel: (day: string) => string;
  series: LineSeries[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const clip = useId();
  const [ref, width] = useWidth();
  const right = 56; // room for the direct labels at the line ends
  const grid = ticks(Math.max(...series.flatMap((s) => s.values)));
  const top = grid[grid.length - 1];
  const plotW = width - PAD.left - right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (days.length > 1 ? (i / (days.length - 1)) * plotW : 0);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const last = days.length - 1;

  // Label every other week along the bottom.
  const labelEvery = Math.max(1, Math.round(days.length / 4));

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * width;
    const i = Math.round(((px - PAD.left) / plotW) * last);
    setHover(Math.min(last, Math.max(0, i)));
  }

  // Keep end labels from colliding when the lines finish close together.
  const ends = series
    .map((s) => ({ s, y: y(s.values[last] ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  }

  return (
    <div className="relative px-3 pt-2 pb-3">
      <div ref={ref}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full touch-none overflow-visible"
          role="img"
          aria-label={series
            .map(
              (s) =>
                `${s.name}: ${s.values[0] ?? 0} on ${dayLabel(days[0])}, ${s.values[last] ?? 0} today`,
            )
            .join(". ")}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={clip}>
              <rect x={PAD.left} y={0} width={plotW + 4} height={height} />
            </clipPath>
          </defs>
          {grid.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--border)"
              />
              <text
                x={PAD.left - 6}
                y={y(v)}
                dy="0.32em"
                textAnchor="end"
                className="fill-[var(--text-faint)] text-[11px] tabular-nums"
              >
                {v}
              </text>
            </g>
          ))}
          {days.map((d, i) =>
            i % labelEvery === 0 || i === last ? (
              <text
                key={d}
                x={x(i)}
                y={height - 6}
                textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
                className="fill-[var(--text-faint)] text-[11px]"
              >
                {i === last ? "Today" : dayLabel(d)}
              </text>
            ) : null,
          )}
          {hover !== null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--border-strong)"
            />
          ) : null}
          <g clipPath={`url(#${clip})`}>
            {series.map((s) => (
              <polyline
                key={s.key}
                points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? "5 4" : undefined}
              />
            ))}
          </g>
          {series.map((s) => (
            <circle
              key={s.key}
              cx={x(hover ?? last)}
              cy={y(s.values[hover ?? last] ?? 0)}
              r={4}
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth={2}
            />
          ))}
          {ends.map(({ s, y: ly }) => (
            <text
              key={s.key}
              x={PAD.left + plotW + 8}
              y={ly}
              dy="0.32em"
              className="fill-[var(--text-muted)] text-[11px]"
            >
              {s.name}
            </text>
          ))}
        </svg>
      </div>
      {hover !== null ? (
        <Tooltip
          className={cn("top-0", hover > last / 2 ? "left-14" : "right-16")}
        >
          <span className="mb-0.5 block font-semibold">
            {dayLabel(days[hover])}
          </span>
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-3 rounded"
                style={{ background: s.color }}
              />
              {s.name}
              <b className="ml-auto pl-3 font-semibold tabular-nums">
                {s.values[hover]}
              </b>
            </span>
          ))}
        </Tooltip>
      ) : null}
      <table className="sr-only">
        <thead>
          <tr>
            <th>Day</th>
            {series.map((s) => (
              <th key={s.key}>{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={d}>
              <td>{dayLabel(d)}</td>
              {series.map((s) => (
                <td key={s.key}>{s.values[i]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A legend row for charts with two or more series. */
export function Legend({
  series,
}: {
  series: Pick<LineSeries, "key" | "name" | "color" | "dashed">[];
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-xs text-muted">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <svg width="16" height="6" aria-hidden>
            <line
              x1="1"
              x2="15"
              y1="3"
              y2="3"
              stroke={s.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "4 3" : undefined}
            />
          </svg>
          {s.name}
        </span>
      ))}
    </div>
  );
}
