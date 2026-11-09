"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createProject } from "@/actions";
import { Dot, Pill } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { colorFg, colorVar } from "@/lib/colors";
import { todayString } from "@/lib/dates";
import { TEMPLATES, type TemplateId } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { useApp } from "./app-context";

/** Name it, pick a starting point, done. Everything else has a default. */
export function NewProjectDialog({
  open,
  defaultWorkspaceId,
  onOpenChange,
}: {
  open: boolean;
  defaultWorkspaceId?: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          title="New project"
          description="Give it a name and pick a starting point. You can change everything later."
        >
          <NewProjectForm
            defaultWorkspaceId={defaultWorkspaceId}
            onDone={() => onOpenChange(false)}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function NewProjectForm({
  defaultWorkspaceId,
  onDone,
}: {
  defaultWorkspaceId?: string;
  onDone: () => void;
}) {
  const { workspaces } = useApp();
  const router = useRouter();
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState(
    workspaces.find((w) => w.id === defaultWorkspaceId)?.id ?? workspaces[0]?.id ?? "",
  );
  const [template, setTemplate] = useState<TemplateId>("blank");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const chosen = TEMPLATES.find((t) => t.id === template);
    const finalName = name.trim() || (template === "blank" ? "" : (chosen?.name ?? ""));
    if (!finalName || !workspaceId) return;
    startTransition(async () => {
      const result = await createProject({
        workspaceId,
        name: finalName,
        template,
        today: todayString(),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onDone();
      router.push(`/w/${result.workspaceId}/p/${result.projectId}`);
    });
  }

  const chosen = TEMPLATES.find((t) => t.id === template);
  const canSubmit = Boolean(name.trim() || template !== "blank");

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Name
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={template === "blank" ? "e.g. Kitchen remodel" : chosen?.name}
          maxLength={80}
          autoFocus
        />
      </label>

      <div className="flex flex-col gap-1.5 text-[13px] font-medium">
        Workspace
        <div className="flex flex-wrap gap-1.5">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => setWorkspaceId(ws.id)}
              aria-pressed={workspaceId === ws.id}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md border px-2.5 text-[13px] font-medium",
                workspaceId === ws.id
                  ? "border-accent bg-accent/8 text-ink"
                  : "border-line text-muted hover:bg-surface-2",
              )}
            >
              <span
                style={{ background: colorVar(ws.color), color: colorFg(ws.color) }}
                className="flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold"
              >
                {ws.name.slice(0, 1).toUpperCase()}
              </span>
              {ws.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-[13px] font-medium">
        Start from
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              aria-pressed={template === t.id}
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border p-3 text-left",
                template === t.id
                  ? "border-accent bg-accent/6"
                  : "border-line hover:bg-surface-2",
              )}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold">
                <Dot color={t.color} />
                {t.name}
              </span>
              <span className="text-xs font-normal text-muted">{t.description}</span>
              <span className="flex flex-wrap gap-1">
                {t.statuses.map((s) => (
                  <Pill key={s.name} color={s.color} className="h-[18px] px-1.5 text-[10px]">
                    {s.name}
                  </Pill>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending || !canSubmit}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
