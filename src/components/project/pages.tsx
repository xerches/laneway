"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowLeft,
  BookmarkPlus,
  Copy,
  Eye,
  FileText,
  MoreHorizontal,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import * as actions from "@/actions";
import { Button } from "@/components/ui/button";
import { Markdown, toggleCheckbox } from "@/components/ui/markdown";
import {
  Dialog,
  DialogContent,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/overlays";
import { clientId } from "@/lib/client";
import { formatShort } from "@/lib/dates";
import { fillTemplate, PAGE_TEMPLATES } from "@/lib/page-templates";
import type { PageFull, PageLite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useProject } from "./store";

/**
 * Pages: Markdown notes inside a project (briefs, meeting notes, decisions),
 * started blank or from a template.
 */
export function PagesView({
  pageId,
  onSelect,
}: {
  pageId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { pages, project, run, today } = useProject();
  const selected = pages.find((p) => p.id === pageId) ?? null;

  async function create(title: string, body: string) {
    const id = clientId();
    const result = await run(() =>
      actions.createPage({
        id,
        projectId: project.id,
        title: fillTemplate(title, formatShort(today)),
        body: fillTemplate(body, formatShort(today)),
      }),
    );
    if (result.ok) onSelect(id);
  }

  return (
    <div className="flex h-full min-h-0 gap-4 px-4 pb-4 md:px-6">
      <aside
        className={cn(
          "flex w-full shrink-0 flex-col gap-2 md:w-64",
          selected && "max-md:hidden",
        )}
      >
        <NewPageMenu onCreate={create} />
        <ul className="thin-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {pages.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onSelect(p.id)}
                aria-current={p.id === pageId ? "page" : undefined}
                className={cn(
                  "flex w-full flex-col rounded-md px-2.5 py-2 text-left hover:bg-surface-2",
                  p.id === pageId && "bg-surface-2",
                )}
              >
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <FileText size={14} className="shrink-0 text-faint" />
                  <span className="truncate">{p.title || "Untitled"}</span>
                </span>
                <span className="pl-[22px] text-[11px] text-faint">
                  Edited {formatDistanceToNowStrict(new Date(p.updatedAt), { addSuffix: true })}
                </span>
              </button>
            </li>
          ))}
          {pages.length === 0 ? (
            <li className="rounded-lg border border-dashed border-line-strong px-3 py-6 text-center text-[13px] text-muted">
              No pages yet. Start one for a brief, meeting notes or a decision.
            </li>
          ) : null}
        </ul>
      </aside>

      <section className={cn("min-w-0 flex-1", !selected && "max-md:hidden")}>
        {selected ? (
          <PageEditor key={selected.id} page={selected} onClose={() => onSelect(null)} />
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-line-strong text-[13px] text-muted">
            Pick a page, or start a new one.
          </div>
        )}
      </section>
    </div>
  );
}

function NewPageMenu({ onCreate }: { onCreate: (title: string, body: string) => void }) {
  const { templates } = useProject();
  const saved = templates.filter((t) => t.kind === "page");
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="primary" className="justify-center">
          <Plus size={15} /> New page
        </Button>
      </MenuTrigger>
      <MenuContent className="w-72">
        <MenuItem onSelect={() => onCreate("", "")}>
          <FileText size={14} />
          <span className="flex flex-col">
            <span>Blank page</span>
          </span>
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Templates</MenuLabel>
        {PAGE_TEMPLATES.map((t) => (
          <MenuItem key={t.id} onSelect={() => onCreate(t.title, t.body)}>
            <span className="flex flex-col">
              <span>{t.name}</span>
              <span className="text-xs text-faint">{t.description}</span>
            </span>
          </MenuItem>
        ))}
        {saved.length ? (
          <>
            <MenuSeparator />
            <MenuLabel>Saved in this workspace</MenuLabel>
            {saved.map((t) => (
              <MenuItem key={t.id} onSelect={() => onCreate(t.title, t.body)}>
                <BookmarkPlus size={14} />
                {t.name}
              </MenuItem>
            ))}
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}

type SaveState = "saved" | "saving" | "unsaved";

function PageEditor({ page, onClose }: { page: PageLite; onClose: () => void }) {
  const { run, project } = useProject();
  const [full, setFull] = useState<PageFull | null>(null);
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"edit" | "read">("read");
  const [state, setState] = useState<SaveState>("saved");
  const [dialog, setDialog] = useState<"template" | "delete" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title: page.title, body: "" });
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    actions.loadPage(page.id).then((loaded) => {
      if (cancelled || !loaded) return;
      setFull(loaded);
      setBody(loaded.body);
      latest.current = { title: loaded.title, body: loaded.body };
      if (!loaded.body.trim()) setMode("edit");
    });
    return () => {
      cancelled = true;
    };
  }, [page.id]);

  // Save whatever is pending when the editor closes.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void actions.updatePage({ pageId: page.id, ...latest.current });
      }
    };
  }, [page.id]);

  function schedule(next: { title?: string; body?: string }) {
    latest.current = { ...latest.current, ...next };
    setState("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
  }

  function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setState("saving");
    const snapshot = latest.current;
    void run(() =>
      actions.updatePage({ pageId: page.id, title: snapshot.title, body: snapshot.body }),
    ).then((result) => setState(result.ok ? "saved" : "unsaved"));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`# ${title}\n\n${body}`);
      toast.success("Copied as Markdown.");
    } catch {
      toast.error("Couldn't copy.");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-line bg-surface shadow-card">
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-3 py-2">
        <button
          onClick={onClose}
          aria-label="Back to pages"
          className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-ink md:hidden"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex rounded-md border border-line p-0.5" role="radiogroup" aria-label="Mode">
          <button
            role="radio"
            aria-checked={mode === "read"}
            onClick={() => {
              if (state === "unsaved") flush();
              setMode("read");
            }}
            className={cn(
              "flex h-6 items-center gap-1 rounded px-2 text-xs font-medium",
              mode === "read" ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
            )}
          >
            <Eye size={12} /> Read
          </button>
          <button
            role="radio"
            aria-checked={mode === "edit"}
            onClick={() => {
              setMode("edit");
              requestAnimationFrame(() => area.current?.focus());
            }}
            className={cn(
              "flex h-6 items-center gap-1 rounded px-2 text-xs font-medium",
              mode === "edit" ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
            )}
          >
            <PencilLine size={12} /> Edit
          </button>
        </div>
        <span className="flex-1" />
        <span className="text-xs text-faint" aria-live="polite">
          {state === "saving" ? "Saving…" : state === "unsaved" ? "Unsaved" : full ? "Saved" : ""}
        </span>
        <Menu>
          <MenuTrigger
            aria-label="Page options"
            className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-ink"
          >
            <MoreHorizontal size={16} />
          </MenuTrigger>
          <MenuContent align="end" className="w-52">
            <MenuItem onSelect={() => setDialog("template")}>
              <BookmarkPlus size={14} /> Save as template
            </MenuItem>
            <MenuItem onSelect={copy}>
              <Copy size={14} /> Copy as Markdown
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => setDialog("delete")}>
              <Trash2 size={14} /> Delete page
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-8">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            schedule({ title: e.target.value });
          }}
          onBlur={() => state === "unsaved" && flush()}
          placeholder="Untitled"
          aria-label="Page title"
          maxLength={200}
          className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-faint"
        />
        {full?.updatedByName ? (
          <p className="mt-1 text-xs text-faint">
            Last edited by {full.updatedByName}{" "}
            {formatDistanceToNowStrict(new Date(page.updatedAt), { addSuffix: true })}
          </p>
        ) : null}

        <div className="mt-4">
          {!full ? (
            <div className="flex flex-col gap-2">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          ) : mode === "edit" ? (
            <textarea
              ref={area}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                schedule({ body: e.target.value });
              }}
              onBlur={() => state === "unsaved" && flush()}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                  e.preventDefault();
                  flush();
                }
              }}
              placeholder={"Write in Markdown. # Heading, - list, - [ ] checkbox, **bold**, [link](https://…)"}
              aria-label="Page body"
              spellCheck
              className="min-h-[50vh] w-full resize-none bg-transparent font-mono text-[13px] leading-relaxed outline-none placeholder:text-faint"
            />
          ) : body.trim() ? (
            <Markdown
              source={body}
              onToggle={(line) => {
                const next = toggleCheckbox(body, line);
                setBody(next);
                latest.current = { ...latest.current, body: next };
                flush();
              }}
            />
          ) : (
            <button onClick={() => setMode("edit")} className="text-[13px] text-faint hover:text-ink">
              Empty page. Click to write.
            </button>
          )}
        </div>
      </div>

      <Dialog open={dialog === "template"} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog === "template" ? (
          <DialogContent
            title="Save as a page template"
            description="New pages anywhere in this workspace can start from it."
            className="w-[min(440px,calc(100vw-24px))]"
          >
            <form
              className="flex flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
                if (!name) return;
                const result = await run(() =>
                  actions.savePageTemplate({
                    id: clientId(),
                    workspaceId: project.workspaceId,
                    name,
                    title,
                    body,
                  }),
                );
                if (result.ok) {
                  toast.success("Template saved.");
                  setDialog(null);
                }
              }}
            >
              <input
                name="name"
                autoFocus
                defaultValue={title}
                maxLength={80}
                required
                aria-label="Template name"
                className="h-9 rounded-md border border-line bg-bg px-2.5 text-sm outline-none focus:border-accent"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Save template
                </Button>
              </div>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog === "delete" ? (
          <DialogContent
            title={`Delete “${title || "Untitled"}”?`}
            description="The page and everything on it goes. This can't be undone."
            className="w-[min(440px,calc(100vw-24px))]"
          >
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (timer.current) clearTimeout(timer.current);
                  timer.current = null;
                  setDialog(null);
                  onClose();
                  await run(() => actions.deletePage({ pageId: page.id }));
                }}
              >
                Delete page
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
