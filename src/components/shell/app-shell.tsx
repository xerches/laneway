"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon } from "lucide-react";
import { Wordmark } from "@/components/logo";
import type { ProjectLite, WorkspaceLite } from "@/lib/types";
import { AppContext, type AppContextValue } from "./app-context";
import { CommandPalette } from "./command-palette";
import { NewProjectDialog } from "./new-project-dialog";
import { Sidebar } from "./sidebar";

export function AppShell({
  user,
  workspaces,
  projects,
  unread,
  children,
}: {
  user: AppContextValue["user"];
  workspaces: WorkspaceLite[];
  projects: ProjectLite[];
  unread: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newProject, setNewProject] = useState<{ open: boolean; workspaceId?: string }>({
    open: false,
  });
  const [navOpen, setNavOpen] = useState(false);

  const openNewProject = useCallback((workspaceId?: string) => {
    setPaletteOpen(false);
    setNewProject({ open: true, workspaceId });
  }, []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);

  // Close the mobile drawer after navigating.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setNavOpen(false);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({ user, workspaces, projects, unread, openNewProject, openPalette }),
    [user, workspaces, projects, unread, openNewProject, openPalette],
  );

  // The workspace in the URL becomes the default for "new project".
  const currentWorkspaceId = pathname.match(/^\/w\/([a-z0-9]+)/)?.[1];

  return (
    <AppContext value={value}>
      <div className="flex h-dvh overflow-hidden">
        <aside className="hidden w-64 shrink-0 border-r border-line bg-surface md:block">
          <Sidebar />
        </aside>

        {navOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              aria-label="Close menu"
              className="animate-fade absolute inset-0 bg-black/40"
              onClick={() => setNavOpen(false)}
            />
            <aside className="animate-fade absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface shadow-pop">
              <Sidebar />
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 md:hidden">
            <button
              aria-label="Open menu"
              onClick={() => setNavOpen(true)}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2"
            >
              <MenuIcon size={18} />
            </button>
            <Wordmark />
          </header>
          <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <NewProjectDialog
        open={newProject.open}
        defaultWorkspaceId={newProject.workspaceId ?? currentWorkspaceId}
        onOpenChange={(open) => setNewProject((prev) => ({ ...prev, open }))}
      />
    </AppContext>
  );
}
