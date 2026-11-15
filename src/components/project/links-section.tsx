"use client";

import { useState } from "react";
import { BookOpen, GitPullRequest, Globe, Link2, Mail, Plus, X } from "lucide-react";
import * as actions from "@/actions";
import { clientId } from "@/lib/client";
import { isSafeLink, linkKind, linkLabel, normalizeLink, type LinkKind } from "@/lib/links";
import type { ItemLinkEntry } from "@/lib/types";
import { useProject } from "./store";

const ICONS: Record<LinkKind, typeof Globe> = {
  obsidian: BookOpen,
  github: GitPullRequest,
  mail: Mail,
  web: Globe,
};

/** Web pages, Obsidian notes, GitHub pull requests: anything the item points at. */
export function LinksSection({
  itemId,
  links,
  loading,
}: {
  itemId: string;
  links: ItemLinkEntry[];
  loading: boolean;
}) {
  const { run } = useProject();
  const [pending, setPending] = useState<ItemLinkEntry[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const saved = links.filter((l) => !removed.includes(l.id));
  const savedIds = new Set(saved.map((l) => l.id));
  const shown = [...saved, ...pending.filter((p) => !savedIds.has(p.id))];

  function add(event: React.FormEvent) {
    event.preventDefault();
    const value = normalizeLink(url);
    if (!url.trim()) return;
    if (!isSafeLink(value)) {
      setError("Use a web address, an obsidian:// link or a mailto: address.");
      return;
    }
    const entry: ItemLinkEntry = {
      id: clientId(),
      url: value,
      title: title.trim(),
      createdAt: new Date().toISOString(),
    };
    setPending((prev) => [...prev, entry]);
    setUrl("");
    setTitle("");
    setError(null);
    setAdding(false);
    void run(() =>
      actions.addItemLink({ id: entry.id, itemId, url: entry.url, title: entry.title }),
    ).then((result) => {
      if (!result.ok) setPending((prev) => prev.filter((p) => p.id !== entry.id));
    });
  }

  function remove(id: string) {
    setRemoved((prev) => [...prev, id]);
    setPending((prev) => prev.filter((p) => p.id !== id));
    void run(() => actions.removeItemLink({ linkId: id }));
  }

  return (
    <section className="mt-5">
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
        Links
        {shown.length > 0 ? (
          <span className="font-normal text-faint normal-case tabular-nums">{shown.length}</span>
        ) : null}
      </h3>
      <ul className="mt-1.5 flex flex-col">
        {shown.map((link) => {
          const Icon = ICONS[linkKind(link.url)];
          return (
            <li key={link.id} className="group flex h-8 items-center gap-2.5">
              <Icon size={14} className="shrink-0 text-faint" />
              <a
                href={link.url}
                target={link.url.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer noopener"
                title={link.url}
                className="min-w-0 flex-1 truncate text-[13px] text-accent hover:underline"
              >
                {linkLabel(link.url, link.title)}
              </a>
              <button
                aria-label={`Remove link ${linkLabel(link.url, link.title)}`}
                onClick={() => remove(link.id)}
                className="rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-danger focus-visible:opacity-100 max-md:opacity-100"
              >
                <X size={13} />
              </button>
            </li>
          );
        })}
        {loading ? <li className="skeleton h-8" /> : null}
      </ul>
      {adding ? (
        <form onSubmit={add} className="mt-1 flex flex-col gap-1.5 rounded-lg border border-line p-2">
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… or obsidian://open?vault=…"
            aria-label="Link address"
            maxLength={2000}
            className="h-8 rounded-md border border-line bg-bg px-2 text-[13px] outline-none focus:border-accent"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            aria-label="Link title"
            maxLength={200}
            className="h-8 rounded-md border border-line bg-bg px-2 text-[13px] outline-none focus:border-accent"
          />
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="h-7 rounded-md px-2.5 text-[13px] text-muted hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 text-[13px] font-medium text-accent-fg"
            >
              <Link2 size={13} /> Add link
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-0.5 flex h-8 items-center gap-1.5 rounded-md text-[13px] text-faint hover:text-ink"
        >
          <Plus size={14} /> Add link
        </button>
      )}
    </section>
  );
}
