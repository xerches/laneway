"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { CalendarDays, Home, Inbox, KanbanSquare, List, Plus, Search } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { searchAllItems } from "@/actions";
import { Dot, Kbd } from "@/components/ui/bits";
import type { SearchHit } from "@/lib/data";
import { colorFg, colorVar } from "@/lib/colors";
import { useApp } from "./app-context";

const itemClass =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] text-ink data-[selected=true]:bg-surface-2";
const groupClass =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-faint";

/** Cmd+K: jump anywhere or run any action without touching the mouse. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspaces, projects, openNewProject } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  const projectMatch = pathname.match(/^\/w\/([a-z0-9]+)\/p\/([a-z0-9]+)/);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchAllItems(q);
      if (!cancelled) setHits(found);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function close() {
    onOpenChange(false);
    setQuery("");
    setHits([]);
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  function emit(name: string, detail?: unknown) {
    close();
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  const showHits = query.trim().length >= 2 ? hits : [];

  return (
    <D.Root open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <D.Portal>
        <D.Overlay className="animate-fade fixed inset-0 z-40 bg-black/40" />
        <D.Content
          aria-describedby={undefined}
          className="animate-pop fixed top-[14vh] left-1/2 z-50 w-[min(600px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-pop outline-none"
        >
          <D.Title className="sr-only">Search and commands</D.Title>
          <Command loop>
            <div className="flex items-center gap-2.5 border-b border-line px-3.5">
              <Search size={16} className="text-faint" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search items, jump to a project, or run a command…"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
              />
              <Kbd>esc</Kbd>
            </div>
            <Command.List className="thin-scroll max-h-[52vh] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted">
                Nothing matches that.
              </Command.Empty>

              {showHits.length > 0 ? (
                <Command.Group heading="Items" className={groupClass}>
                  {showHits.map((hit) => (
                    <Command.Item
                      key={hit.id}
                      value={`${hit.title} ${hit.projectKey}-${hit.number} ${hit.id}`}
                      onSelect={() =>
                        go(`/w/${hit.workspaceId}/p/${hit.projectId}?item=${hit.id}`)
                      }
                      className={itemClass}
                    >
                      <Dot color={hit.projectColor} />
                      <span className="flex-1 truncate">{hit.title}</span>
                      <span className="shrink-0 text-xs text-faint">
                        {hit.projectName} · {hit.projectKey}-{hit.number}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              <Command.Group heading="Actions" className={groupClass}>
                {projectMatch ? (
                  <Command.Item
                    value="new item create task add"
                    onSelect={() => emit("laneway:new-item")}
                    className={itemClass}
                  >
                    <Plus size={15} className="text-muted" />
                    <span className="flex-1">New item in this project</span>
                    <Kbd>C</Kbd>
                  </Command.Item>
                ) : null}
                <Command.Item
                  value="new project create board"
                  onSelect={() => openNewProject(projectMatch?.[1])}
                  className={itemClass}
                >
                  <Plus size={15} className="text-muted" />
                  New project
                </Command.Item>
                {projectMatch ? (
                  <>
                    <Command.Item
                      value="view board kanban"
                      onSelect={() => emit("laneway:view", "board")}
                      className={itemClass}
                    >
                      <KanbanSquare size={15} className="text-muted" />
                      <span className="flex-1">Show as board</span>
                      <Kbd>1</Kbd>
                    </Command.Item>
                    <Command.Item
                      value="view list table"
                      onSelect={() => emit("laneway:view", "list")}
                      className={itemClass}
                    >
                      <List size={15} className="text-muted" />
                      <span className="flex-1">Show as list</span>
                      <Kbd>2</Kbd>
                    </Command.Item>
                    <Command.Item
                      value="view calendar month"
                      onSelect={() => emit("laneway:view", "calendar")}
                      className={itemClass}
                    >
                      <CalendarDays size={15} className="text-muted" />
                      <span className="flex-1">Show as calendar</span>
                      <Kbd>3</Kbd>
                    </Command.Item>
                  </>
                ) : null}
              </Command.Group>

              <Command.Group heading="Go to" className={groupClass}>
                <Command.Item value="home dashboard" onSelect={() => go("/")} className={itemClass}>
                  <Home size={15} className="text-muted" />
                  Home
                </Command.Item>
                <Command.Item
                  value="inbox notifications"
                  onSelect={() => go("/inbox")}
                  className={itemClass}
                >
                  <Inbox size={15} className="text-muted" />
                  Inbox
                </Command.Item>
                {workspaces.map((ws) => (
                  <Command.Item
                    key={ws.id}
                    value={`workspace ${ws.name} ${ws.id}`}
                    onSelect={() => go(`/w/${ws.id}`)}
                    className={itemClass}
                  >
                    <span
                      style={{ background: colorVar(ws.color), color: colorFg(ws.color) }}
                      className="flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold"
                    >
                      {ws.name.slice(0, 1).toUpperCase()}
                    </span>
                    {ws.name}
                  </Command.Item>
                ))}
                {projects.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`project ${p.name} ${p.id}`}
                    onSelect={() => go(`/w/${p.workspaceId}/p/${p.id}`)}
                    className={itemClass}
                  >
                    <Dot color={p.color} className="mx-[3px]" />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-faint">
                      {workspaces.find((w) => w.id === p.workspaceId)?.name}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
