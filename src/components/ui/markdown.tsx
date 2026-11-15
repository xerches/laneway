"use client";

import { Fragment, type ReactNode } from "react";
import { Check } from "lucide-react";
import { isSafeLink } from "@/lib/links";
import { cn } from "@/lib/utils";

/**
 * A small Markdown renderer that builds React elements directly, so nothing
 * a page contains is ever injected as HTML. It covers what notes use:
 * headings, lists, checklists, tables, quotes, code, links and emphasis.
 * Checkboxes can be ticked in place through `onToggle`.
 */

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "quote"; text: string }
  | { kind: "code"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "rule" };

type ListItem = { text: string; checked: boolean | null; line: number; indent: number };

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(\[( |x|X)\]\s?)?(.*)$/;

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i += 1;
      continue;
    }
    if (
      line.trim().startsWith("|") &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])
    ) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    if (line.trim().startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        body.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", text: body.join("\n") });
      continue;
    }
    const first = LIST.exec(line);
    if (first) {
      const ordered = /\d/.test(first[2]);
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i]);
        if (!m) break;
        items.push({
          text: m[5],
          checked: m[3] ? m[4].toLowerCase() === "x" : null,
          line: i,
          indent: Math.min(3, Math.floor(m[1].replace(/\t/g, "  ").length / 2)),
        });
        i += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const body: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !LIST.exec(lines[i]) &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith(">")
    ) {
      body.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: "paragraph", text: body.join("\n") });
  }
  return blocks;
}

/** Flips the checkbox on one line of the source. */
export function toggleCheckbox(source: string, line: number): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const m = LIST.exec(lines[line] ?? "");
  if (!m || !m[3]) return source;
  const checked = m[4].toLowerCase() === "x";
  lines[line] = lines[line].replace(/\[( |x|X)\]/, checked ? "[ ]" : "[x]");
  return lines.join("\n");
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(~~[^~]+~~)|(\[\[[^\]]+\]\])|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s)]+)/g;

function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const token = match[0];
    const k = `${key}-${n++}`;
    if (match[1]) {
      out.push(
        <code key={k} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (match[2] || match[3]) {
      out.push(<strong key={k}>{inline(token.slice(2, -2), k)}</strong>);
    } else if (match[4] || match[5]) {
      out.push(<em key={k}>{inline(token.slice(1, -1), k)}</em>);
    } else if (match[6]) {
      out.push(<del key={k}>{inline(token.slice(2, -2), k)}</del>);
    } else if (match[7]) {
      const inner = token.slice(2, -2);
      const label = inner.includes("|") ? inner.split("|")[1] : inner;
      out.push(
        <span key={k} className="rounded bg-accent/10 px-1 text-accent" title={inner}>
          {label}
        </span>,
      );
    } else if (match[8]) {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)!;
      const href = m[2];
      out.push(
        isSafeLink(href) ? (
          <a
            key={k}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer noopener"
            className="text-accent underline-offset-2 hover:underline"
          >
            {inline(m[1], k)}
          </a>
        ) : (
          <Fragment key={k}>{m[1]}</Fragment>
        ),
      );
    } else if (match[9]) {
      out.push(
        <a
          key={k}
          href={token}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent underline-offset-2 hover:underline"
        >
          {token}
        </a>,
      );
    }
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withBreaks(text: string, key: string): ReactNode[] {
  return text.split("\n").flatMap((line, index) =>
    index === 0 ? inline(line, `${key}-${index}`) : [<br key={`${key}-br-${index}`} />, ...inline(line, `${key}-${index}`)],
  );
}

const HEADINGS = [
  "text-xl font-semibold mt-6 mb-2",
  "text-lg font-semibold mt-5 mb-2",
  "text-base font-semibold mt-4 mb-1.5",
  "text-sm font-semibold mt-3 mb-1",
  "text-sm font-semibold mt-3 mb-1",
  "text-sm font-semibold mt-3 mb-1",
];

export function Markdown({
  source,
  onToggle,
  className,
}: {
  source: string;
  onToggle?: (line: number) => void;
  className?: string;
}) {
  const blocks = parseBlocks(source);
  return (
    <div className={cn("text-[14px] leading-relaxed break-words [&>*:first-child]:mt-0", className)}>
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.kind) {
          case "heading": {
            const Tag = `h${Math.min(block.level + 1, 6)}` as "h2";
            return (
              <Tag key={key} className={HEADINGS[block.level - 1]}>
                {inline(block.text, key)}
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={key} className="my-2">
                {withBreaks(block.text, key)}
              </p>
            );
          case "quote":
            return (
              <blockquote key={key} className="my-2 border-l-4 border-line-strong pl-3 text-muted">
                {withBreaks(block.text, key)}
              </blockquote>
            );
          case "code":
            return (
              <pre key={key} className="thin-scroll my-2 overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-[13px]">
                <code>{block.text}</code>
              </pre>
            );
          case "rule":
            return <hr key={key} className="my-4 border-line" />;
          case "table":
            return (
              <div key={key} className="thin-scroll my-2 overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {block.head.map((cell, c) => (
                        <th key={c} className="border border-line bg-surface-2 px-2 py-1 text-left font-semibold">
                          {inline(cell, `${key}h${c}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {block.head.map((_, c) => (
                          <td key={c} className="border border-line px-2 py-1 align-top">
                            {inline(row[c] ?? "", `${key}r${r}c${c}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag
                key={key}
                className={cn("my-2 flex flex-col gap-0.5", block.ordered ? "list-decimal pl-6" : "pl-1")}
              >
                {block.items.map((item) => (
                  <li
                    key={item.line}
                    style={{ marginLeft: item.indent * 20 }}
                    className={cn(
                      !block.ordered && "flex items-start gap-2",
                      !block.ordered && item.checked === null && "before:mt-[0.6em] before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-faint",
                    )}
                  >
                    {item.checked !== null ? (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={item.checked}
                        aria-label={item.text || "Checklist item"}
                        disabled={!onToggle}
                        onClick={() => onToggle?.(item.line)}
                        className={cn(
                          "mt-[0.2em] flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                          item.checked
                            ? "border-transparent bg-[var(--c-green)] text-white"
                            : "border-line-strong hover:border-accent",
                        )}
                      >
                        {item.checked ? <Check size={11} strokeWidth={3} /> : null}
                      </button>
                    ) : null}
                    <span className={cn("min-w-0", item.checked && "text-faint line-through")}>
                      {inline(item.text, `${key}-${item.line}`)}
                    </span>
                  </li>
                ))}
              </Tag>
            );
          }
        }
      })}
    </div>
  );
}
