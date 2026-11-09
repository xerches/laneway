"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Check,
  Copy,
  KanbanSquare,
  List,
  Mail,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import * as actions from "@/actions";
import { useApp } from "@/components/shell/app-context";
import { Dot } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { ColorSwatches } from "@/components/ui/color-swatches";
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
import { isTypingTarget, useToday } from "@/lib/client";
import type { ItemLite, Member, ProjectFull, StatusLite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Board, QuickAdd } from "./board";
import { CalendarView } from "./calendar";
import { ItemPanel } from "./item-panel";
import { ListView } from "./list";
import { ProjectStore, useProject } from "./store";

type View = "board" | "list" | "calendar";

const VIEWS: { id: View; label: string; icon: typeof List; key: string }[] = [
  { id: "board", label: "Board", icon: KanbanSquare, key: "1" },
  { id: "list", label: "List", icon: List, key: "2" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, key: "3" },
];

export function ProjectView(props: {
  project: ProjectFull;
  statuses: StatusLite[];
  items: ItemLite[];
  members: Member[];
  userId: string;
}) {
  const today = useToday();
  if (!today) return <ProjectSkeleton />;
  return (
    <ProjectStore {...props} today={today}>
      <ProjectScreen />
    </ProjectStore>
  );
}

export function ProjectSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="skeleton h-7 w-64" />
      <div className="skeleton h-8 w-72" />
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="skeleton h-2/3 w-[280px]" />
        <div className="skeleton h-1/2 w-[280px]" />
        <div className="skeleton h-1/3 w-[280px] max-md:hidden" />
      </div>
    </div>
  );
}

function ProjectScreen() {
  const { project, addItem, items } = useProject();
  const pathname = usePathname();
  const params = useSearchParams();
  const viewParam = params.get("view");
  const view: View = viewParam === "list" || viewParam === "calendar" ? viewParam : "board";
  const openId = params.get("item");
  const [adding, setAdding] = useState(false);

  const setParams = useCallback(
    (patch: Record<string, string | null>, push = false) => {
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (push) window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [pathname],
  );

  const setView = useCallback(
    (next: View) => setParams({ view: next === "board" ? null : next }),
    [setParams],
  );
  const openItem = useCallback((id: string) => setParams({ item: id }, true), [setParams]);
  const closeItem = useCallback(() => setParams({ item: null }), [setParams]);

  // Keyboard: C adds an item, 1/2/3 switch views. The command menu uses the
  // same two events.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector("[role=dialog]")) return;
      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        setAdding(true);
      }
      const found = VIEWS.find((v) => v.key === event.key);
      if (found) setView(found.id);
    }
    function onNewItem() {
      setAdding(true);
    }
    function onView(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (detail === "board" || detail === "list" || detail === "calendar") setView(detail);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("laneway:new-item", onNewItem);
    window.addEventListener("laneway:view", onView);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("laneway:new-item", onNewItem);
      window.removeEventListener("laneway:view", onView);
    };
  }, [setView]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 px-4 pt-4 md:px-6 md:pt-5">
        <div className="flex items-center gap-1.5">
          <Dot color={project.color} className="h-3 w-3" />
          <ProjectTitle />
          <ProjectMenu />
          <span className="flex-1" />
          <Button variant="primary" onClick={() => setAdding(true)} title="New item (C)">
            <Plus size={15} />
            <span className="max-sm:hidden">New item</span>
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-1 border-b border-line">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              aria-current={view === v.id ? "page" : undefined}
              title={`${v.label} (${v.key})`}
              className={cn(
                "-mb-px flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-[13px] font-medium",
                view === v.id
                  ? "border-accent text-ink"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              <v.icon size={14} />
              {v.label}
            </button>
          ))}
          <span className="flex-1" />
          <span className="pr-1 text-xs text-faint tabular-nums max-sm:hidden">
            {items.filter((i) => !i.completedAt).length} open
          </span>
        </div>

        {adding ? (
          <div className="pt-3">
            <QuickAdd
              className="h-10 text-sm"
              placeholder="New item: type a title and press Enter"
              onAdd={(title) => addItem({ title })}
              onClose={() => setAdding(false)}
            />
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 pt-3">
        {view === "board" ? <Board onOpen={openItem} /> : null}
        {view === "list" ? <ListView onOpen={openItem} /> : null}
        {view === "calendar" ? <CalendarView onOpen={openItem} /> : null}
      </div>

      {openId ? <ItemPanel itemId={openId} onClose={closeItem} /> : null}
    </div>
  );
}

function ProjectTitle() {
  const { project, run } = useProject();
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={project.name}
        maxLength={80}
        aria-label="Project name"
        className="h-8 min-w-0 flex-1 rounded-md border border-accent bg-surface px-2 text-lg font-semibold outline-none"
        onBlur={(e) => {
          const name = e.target.value.trim();
          if (name && name !== project.name) {
            void run(() => actions.updateProject({ projectId: project.id, name }));
          }
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <h1 className="min-w-0">
      <button
        onClick={() => setEditing(true)}
        title="Click to rename"
        className="block max-w-full truncate rounded-md px-1.5 text-lg font-semibold hover:bg-surface-2"
      >
        {project.name}
      </button>
    </h1>
  );
}

function ProjectMenu() {
  const { project, run } = useProject();
  const { workspaces } = useApp();
  const [dialog, setDialog] = useState<"email" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();
  const workspace = workspaces.find((w) => w.id === project.workspaceId);

  return (
    <>
      <Menu>
        <MenuTrigger
          aria-label="Project options"
          className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-ink"
        >
          <MoreHorizontal size={16} />
        </MenuTrigger>
        <MenuContent className="w-56">
          <MenuLabel>Color</MenuLabel>
          <div className="px-2 pb-2">
            <ColorSwatches
              value={project.color}
              onChange={(color) =>
                void run(() => actions.updateProject({ projectId: project.id, color }))
              }
            />
          </div>
          <MenuSeparator />
          <MenuItem onSelect={() => setDialog("email")}>
            <Mail size={14} /> Email to this project
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger onSelect={() => setDialog("delete")}>
            <Trash2 size={14} /> Delete project
          </MenuItem>
        </MenuContent>
      </Menu>

      <Dialog open={dialog === "email"} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog === "email" ? (
          <DialogContent
            title="Email to this project"
            description="Every email sent to this address becomes an item here, and shows up in your inbox."
          >
            <EmailIntake token={project.inboundToken} />
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog === "delete" ? (
          <DialogContent
            title={`Delete “${project.name}”?`}
            description={`This removes the project and every item in it from ${workspace?.name ?? "this workspace"}. It can't be undone.`}
            className="w-[min(440px,calc(100vw-24px))]"
          >
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await actions.deleteProject({ projectId: project.id });
                  })
                }
              >
                {pending ? "Deleting…" : "Delete project"}
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

function EmailIntake({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/api/inbound/email/${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy. Select the address and copy it by hand.");
    }
  }

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex items-center gap-2 rounded-md border border-line bg-bg p-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{url}</code>
        <Button size="sm" onClick={copy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-muted">
        This is a private web address for this project. Give it to a mail service
        that can forward incoming email to a web address (Postmark, Mailgun,
        SendGrid, Zapier and Make all can). The subject becomes the item&apos;s
        title and the message becomes its description.
      </p>
      <p className="text-faint">
        Anyone with this address can add items here, so keep it private.
      </p>
    </div>
  );
}
