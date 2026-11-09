"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Inbox, LogOut, MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { createWorkspace, updateWorkspace } from "@/actions";
import { Wordmark } from "@/components/logo";
import { Avatar, Dot, Kbd } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { ColorSwatches } from "@/components/ui/color-swatches";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/ui/overlays";
import { authClient } from "@/lib/auth-client";
import { colorFg, colorVar, randomColor } from "@/lib/colors";
import type { WorkspaceLite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useApp } from "./app-context";

const navItem =
  "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-muted hover:bg-surface-2 hover:text-ink";
const navActive = "bg-surface-2 text-ink font-medium";

export function Sidebar() {
  const { user, workspaces, projects, unread, openNewProject, openPalette } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [editing, setEditing] = useState<WorkspaceLite | "new" | null>(null);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center px-4">
        <Link href="/" aria-label="Laneway home">
          <Wordmark />
        </Link>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={openPalette}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-line bg-bg px-2.5 text-[13px] text-faint hover:border-line-strong"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search or jump to…</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      <nav className="thin-scroll flex-1 overflow-y-auto px-3 pb-3">
        <Link href="/" className={cn(navItem, pathname === "/" && navActive)}>
          <Home size={15} />
          Home
        </Link>
        <Link href="/inbox" className={cn(navItem, pathname === "/inbox" && navActive)}>
          <Inbox size={15} />
          <span className="flex-1">Inbox</span>
          {unread > 0 ? (
            <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg">
              {unread}
            </span>
          ) : null}
        </Link>

        {workspaces.map((ws) => {
          const mine = projects.filter((p) => p.workspaceId === ws.id);
          const wsPath = `/w/${ws.id}`;
          return (
            <section key={ws.id} className="mt-4">
              <div className="group flex h-8 items-center gap-1 rounded-md pr-1 hover:bg-surface-2">
                <Link
                  href={wsPath}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 px-2 text-[13px] font-semibold",
                    pathname === wsPath ? "text-ink" : "text-ink/85",
                  )}
                >
                  <span
                    style={{ background: colorVar(ws.color), color: colorFg(ws.color) }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold"
                  >
                    {ws.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{ws.name}</span>
                </Link>
                <Menu>
                  <MenuTrigger
                    aria-label={`${ws.name} options`}
                    className="rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:bg-line hover:text-ink focus-visible:opacity-100 data-[state=open]:opacity-100"
                  >
                    <MoreHorizontal size={14} />
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => setEditing(ws)}>Rename or recolor</MenuItem>
                    <MenuItem onSelect={() => openNewProject(ws.id)}>New project</MenuItem>
                  </MenuContent>
                </Menu>
                <button
                  aria-label={`New project in ${ws.name}`}
                  onClick={() => openNewProject(ws.id)}
                  className="rounded p-1 text-faint hover:bg-line hover:text-ink"
                >
                  <Plus size={14} />
                </button>
              </div>

              <div className="mt-0.5 flex flex-col">
                {mine.map((p) => {
                  const href = `/w/${ws.id}/p/${p.id}`;
                  return (
                    <Link
                      key={p.id}
                      href={href}
                      className={cn(navItem, "pl-3.5", pathname === href && navActive)}
                    >
                      <Dot color={p.color} />
                      <span className="truncate">{p.name}</span>
                    </Link>
                  );
                })}
                {mine.length === 0 ? (
                  <button
                    onClick={() => openNewProject(ws.id)}
                    className={cn(navItem, "pl-3.5 text-faint")}
                  >
                    <Plus size={13} />
                    New project
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}

        <button onClick={() => setEditing("new")} className={cn(navItem, "mt-4 w-full text-faint")}>
          <Plus size={14} />
          Add workspace
        </button>
      </nav>

      <div className="flex shrink-0 items-center gap-2.5 border-t border-line px-3 py-2.5">
        <Avatar name={user.name} id={user.id} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{user.name}</p>
          <p className="truncate text-[11px] text-faint">{user.email}</p>
        </div>
        <button
          onClick={signOut}
          aria-label="Sign out"
          title="Sign out"
          className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-ink"
        >
          <LogOut size={15} />
        </button>
      </div>

      <WorkspaceDialog target={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function WorkspaceDialog({
  target,
  onClose,
}: {
  target: WorkspaceLite | "new" | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target !== null ? (
        <DialogContent
          title={target === "new" ? "Add a workspace" : "Edit workspace"}
          description="A workspace keeps one area of your life apart from the others."
          className="w-[min(420px,calc(100vw-24px))]"
        >
          <WorkspaceForm
            key={target === "new" ? "new" : target.id}
            target={target}
            onClose={onClose}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function WorkspaceForm({
  target,
  onClose,
}: {
  target: WorkspaceLite | "new";
  onClose: () => void;
}) {
  const router = useRouter();
  const isNew = target === "new";
  const [name, setName] = useState(isNew ? "" : target.name);
  const [color, setColor] = useState<string>(() => (isNew ? randomColor() : target.color));
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      const result = isNew
        ? await createWorkspace({ name, color })
        : await updateWorkspace({ workspaceId: target.id, name, color });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onClose();
      if (isNew && "workspaceId" in result) router.push(`/w/${result.workspaceId}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Name
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoFocus
          placeholder="e.g. Family"
        />
      </label>
      <div className="flex flex-col gap-1.5 text-[13px] font-medium">
        Color
        <ColorSwatches value={color} onChange={setColor} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
          {isNew ? "Add workspace" : "Save"}
        </Button>
      </div>
    </form>
  );
}
