"use client";

import { useState, useTransition, type ReactNode } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  AlertCircle,
  Bot,
  Check,
  Copy,
  FileUp,
  GitPullRequest,
  KeyRound,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  createApiToken,
  createGithubHook,
  deleteGithubHook,
  importFile,
  newGithubHookSecret,
  previewImportFile,
  revokeApiToken,
  setGithubHookOnMerge,
} from "@/actions";
import { Dot } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clientId } from "@/lib/client";
import type { ApiTokenLite, GithubHookLite } from "@/lib/data";
import type { ImportPreview } from "@/lib/import";
import type { ImportResult } from "@/lib/import-run";
import type { WorkspaceLite } from "@/lib/types";
import { cn } from "@/lib/utils";

const selectClass =
  "h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-accent";

function ago(iso: string | null) {
  if (!iso) return "never";
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

export function SettingsView({
  workspaces,
  tokens,
  hooks,
  baseUrl,
}: {
  workspaces: WorkspaceLite[];
  tokens: ApiTokenLite[];
  hooks: GithubHookLite[];
  baseUrl: string;
}) {
  // The token just made, shown once and filled into the setup snippets.
  const [fresh, setFresh] = useState<{ id: string; name: string; token: string } | null>(null);

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-5 md:px-8 md:py-7">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-[13px] text-muted">
            Connect Laneway to Claude, your own scripts and GitHub, or import a plan.
          </p>
        </header>

        <Tokens
          workspaces={workspaces}
          tokens={tokens}
          fresh={fresh}
          onCreated={setFresh}
        />
        <Claude baseUrl={baseUrl} token={fresh?.token ?? null} />
        <Github workspaces={workspaces} hooks={hooks} baseUrl={baseUrl} />
        <Import />
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-card md:p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        {icon}
        {title}
      </h2>
      <div className="mt-1 text-[13px] leading-relaxed text-muted">{description}</div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Couldn't copy. Select the text and copy it instead.");
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function Snippet({ text, secret }: { text: string; secret?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-line bg-surface-2 py-1.5 pr-1.5 pl-3",
        secret && "border-accent",
      )}
    >
      <code className="min-w-0 flex-1 py-1 font-mono text-[12px] leading-relaxed break-all whitespace-pre-wrap text-ink">
        {text}
      </code>
      <CopyButton text={text} />
    </div>
  );
}

// -------------------------------------------------------------------- tokens

function Tokens({
  workspaces,
  tokens,
  fresh,
  onCreated,
}: {
  workspaces: WorkspaceLite[];
  tokens: ApiTokenLite[];
  fresh: { id: string; name: string; token: string } | null;
  onCreated: (made: { id: string; name: string; token: string }) => void;
}) {
  const [adding, setAdding] = useState(tokens.length === 0);
  const [name, setName] = useState("Luna");
  const [all, setAll] = useState(false);
  // Work stays out unless you tick it, so day-job items don't leak by default.
  const [picked, setPicked] = useState<string[]>(
    workspaces.filter((w) => w.kind !== "work").map((w) => w.id),
  );
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameOf = (id: string) => workspaces.find((w) => w.id === id);

  function create() {
    const id = clientId();
    const label = name.trim();
    startTransition(async () => {
      const result = await createApiToken({ id, name: label, workspaceIds: all ? null : picked });
      if (!result.ok) return void toast.error(result.error);
      onCreated({ id, name: label, token: result.token });
      setAdding(false);
      setName("");
    });
  }

  function revoke(token: ApiTokenLite) {
    startTransition(async () => {
      const result = await revokeApiToken({ tokenId: token.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`Revoked “${token.name}”. Anything using it stops working now.`);
      setConfirming(null);
    });
  }

  return (
    <Section
      icon={<KeyRound size={16} className="text-accent" />}
      title="API tokens"
      description="A token lets a tool read and change your items as you. Give each tool its own, and keep it to the workspaces it needs."
    >
      {fresh ? (
        <div className="mb-4 rounded-lg border border-accent/50 bg-accent/10 p-3">
          <p className="mb-2 text-[13px] font-medium">
            Here is the token for “{fresh.name}”. Copy it now: Laneway won&apos;t show it again.
          </p>
          <Snippet text={fresh.token} secret />
        </div>
      ) : null}

      {tokens.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">
                  {t.name}{" "}
                  <span className="ml-1 font-mono text-[11px] font-normal text-faint">{t.prefix}…</span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                  {t.workspaceIds ? (
                    t.workspaceIds.map((id) => {
                      const ws = nameOf(id);
                      return ws ? (
                        <span key={id} className="inline-flex items-center gap-1">
                          <Dot color={ws.color} /> {ws.name}
                        </span>
                      ) : null;
                    })
                  ) : (
                    <span>All your workspaces</span>
                  )}
                  <span className="text-faint" suppressHydrationWarning>
                    · Last used {ago(t.lastUsedAt)}
                  </span>
                </p>
              </div>
              {confirming === t.id ? (
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    Keep
                  </Button>
                  <Button size="sm" variant="danger" disabled={pending} onClick={() => revoke(t)}>
                    Revoke
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Revoke ${t.name}`}
                  onClick={() => setConfirming(t.id)}
                >
                  <Trash2 size={14} /> Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <form
          className={cn("flex flex-col gap-3", tokens.length && "mt-4")}
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            Name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Luna, Zapier, my script…"
              maxLength={60}
              className="max-w-sm"
            />
          </label>
          <fieldset className="flex flex-col gap-1.5 text-[13px]">
            <legend className="mb-1 font-medium">Workspaces it can reach</legend>
            {workspaces.map((ws) => (
              <label key={ws.id} className={cn("flex items-center gap-2", all && "opacity-50")}>
                <input
                  type="checkbox"
                  disabled={all}
                  checked={all || picked.includes(ws.id)}
                  onChange={(e) =>
                    setPicked((list) =>
                      e.target.checked ? [...list, ws.id] : list.filter((id) => id !== ws.id),
                    )
                  }
                  className="accent-[var(--accent)]"
                />
                <Dot color={ws.color} />
                {ws.name}
                {ws.kind === "work" ? <span className="text-[12px] text-faint">(work)</span> : null}
              </label>
            ))}
            <label className="mt-1 flex items-center gap-2 text-muted">
              <input
                type="checkbox"
                checked={all}
                onChange={(e) => setAll(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              All workspaces, including ones I add later
            </label>
          </fieldset>
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={pending || !name.trim() || (!all && picked.length === 0)}
            >
              Create token
            </Button>
            {tokens.length ? (
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <Button size="sm" className="mt-3" onClick={() => setAdding(true)}>
          <Plus size={14} /> New token
        </Button>
      )}
    </Section>
  );
}

// -------------------------------------------------------------------- claude

function Claude({ baseUrl, token }: { baseUrl: string; token: string | null }) {
  const shown = token ?? "lw_your_token";
  const mcp = `${baseUrl}/api/mcp`;
  return (
    <Section
      icon={<Bot size={16} className="text-accent" />}
      title="Claude and other AI tools"
      description={
        <>
          Laneway speaks MCP, so Claude (or Luna) can check your agenda, find and create items,
          move them along and comment. It sees only what its token allows.
          {token ? null : " Make a token above and it is filled in here."}
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13px]">
        <div>
          <p className="mb-1.5 font-medium">Claude Code</p>
          <Snippet
            text={`claude mcp add --transport http laneway ${mcp} --header "Authorization: Bearer ${shown}"`}
          />
        </div>
        <div>
          <p className="mb-1.5 font-medium">Any other MCP client</p>
          <p className="mb-1.5 text-muted">
            Use the Streamable HTTP transport with this address, and send the token in an
            Authorization header.
          </p>
          <Snippet text={mcp} />
        </div>
        <div>
          <p className="mb-1.5 font-medium">REST API, for scripts</p>
          <Snippet text={`curl ${baseUrl}/api/v1/agenda -H "Authorization: Bearer ${shown}"`} />
          <p className="mt-1.5 text-[12px] text-faint">
            Also: /api/v1/workspaces, /projects, /items (GET to search, POST to create),
            /items/KEY-12 (GET, PATCH) and /items/KEY-12/comments.
          </p>
        </div>
      </div>
    </Section>
  );
}

// -------------------------------------------------------------------- github

function Github({
  workspaces,
  hooks,
  baseUrl,
}: {
  workspaces: WorkspaceLite[];
  hooks: GithubHookLite[];
  baseUrl: string;
}) {
  const [workspaceId, setWorkspaceId] = useState(
    (workspaces.find((w) => w.kind === "business") ?? workspaces[0])?.id ?? "",
  );
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const wsOf = (id: string) => workspaces.find((w) => w.id === id);
  const urlFor = (id: string) => `${baseUrl}/api/integrations/github/${id}`;

  function create() {
    const id = clientId();
    startTransition(async () => {
      const result = await createGithubHook({ id, workspaceId, onMerge: "done" });
      if (!result.ok) return void toast.error(result.error);
      setSecrets((s) => ({ ...s, [id]: result.secret }));
    });
  }

  function regenerate(hook: GithubHookLite) {
    startTransition(async () => {
      const result = await newGithubHookSecret({ hookId: hook.id });
      if (!result.ok) return void toast.error(result.error);
      setSecrets((s) => ({ ...s, [hook.id]: result.secret }));
      toast.success("New secret made. Paste it into GitHub; the old one no longer works.");
    });
  }

  function setOnMerge(hook: GithubHookLite, value: "done" | "none") {
    startTransition(async () => {
      const result = await setGithubHookOnMerge({ hookId: hook.id, onMerge: value });
      if (!result.ok) toast.error(result.error);
    });
  }

  function remove(hook: GithubHookLite) {
    startTransition(async () => {
      const result = await deleteGithubHook({ hookId: hook.id });
      if (!result.ok) toast.error(result.error);
      setConfirming(null);
    });
  }

  return (
    <Section
      icon={<GitPullRequest size={16} className="text-accent" />}
      title="GitHub"
      description={
        <>
          Mention an item key like <span className="font-mono text-ink">ALI-12</span> in a pull
          request&apos;s title, description or branch name. The item gets a link to the PR, and
          when it merges the item can move to done. GitHub has to be able to reach this
          Laneway: on a Tailscale-only setup, open just the webhook path with Tailscale Funnel
          (the README shows how).
        </>
      }
    >
      {hooks.length ? (
        <ul className="mb-4 flex flex-col gap-3">
          {hooks.map((hook) => {
            const ws = wsOf(hook.workspaceId);
            const secret = secrets[hook.id];
            return (
              <li key={hook.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex flex-1 items-center gap-1.5 text-[13px] font-medium">
                    {ws ? <Dot color={ws.color} /> : null}
                    {ws?.name ?? "Workspace"}
                    <span
                      className="ml-1 text-[12px] font-normal text-faint"
                      suppressHydrationWarning
                    >
                      Last delivery {ago(hook.lastDeliveryAt)}
                    </span>
                  </p>
                  <select
                    aria-label="When a pull request merges"
                    value={hook.onMerge}
                    onChange={(e) => setOnMerge(hook, e.target.value as "done" | "none")}
                    className={selectClass}
                  >
                    <option value="done">On merge: move items to done</option>
                    <option value="none">On merge: just note it</option>
                  </select>
                </div>
                <div className="mt-2.5 flex flex-col gap-2 text-[12px] text-muted">
                  <div>
                    <p className="mb-1">Payload URL</p>
                    <Snippet text={urlFor(hook.id)} />
                  </div>
                  {secret ? (
                    <div>
                      <p className="mb-1 text-ink">Secret. Copy it now: it won&apos;t be shown again.</p>
                      <Snippet text={secret} secret />
                    </div>
                  ) : null}
                  <p>
                    In the repository, open Settings, then Webhooks, then Add webhook. Paste the
                    payload URL and secret, set the content type to application/json, and choose
                    “Let me select individual events” with only Pull requests ticked.
                  </p>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => regenerate(hook)}>
                    <RefreshCw size={13} /> New secret
                  </Button>
                  {confirming === hook.id ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                      <Button size="sm" variant="danger" disabled={pending} onClick={() => remove(hook)}>
                        Delete webhook
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(hook.id)}>
                      <Trash2 size={13} /> Delete
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Workspace for the webhook"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          className={selectClass}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={pending || !workspaceId} onClick={create}>
          <Plus size={14} /> Add GitHub webhook
        </Button>
      </div>
    </Section>
  );
}

// -------------------------------------------------------------------- import

function Import() {
  const [file, setFile] = useState<{ name: string; data: unknown } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(picked: File | undefined) {
    setPreview(null);
    setProblems([]);
    setDone(null);
    setFile(null);
    if (!picked) return;
    startTransition(async () => {
      let data: unknown;
      try {
        data = JSON.parse(await picked.text());
      } catch {
        setProblems(["That file isn't valid JSON."]);
        return;
      }
      setFile({ name: picked.name, data });
      const checked = await previewImportFile(data);
      if (!checked.ok) return void setProblems(checked.problems);
      setPreview(checked.preview);
      setProblems(checked.preview.problems);
    });
  }

  function run() {
    if (!file) return;
    startTransition(async () => {
      const result = await importFile(file.data);
      if (!result.ok) return void toast.error(result.error);
      setDone(result.result);
      setPreview(null);
      setFile(null);
      const n = result.result.projects.length;
      toast.success(`Imported ${n} project${n === 1 ? "" : "s"}.`);
    });
  }

  const newProjects = preview?.workspaces.flatMap((w) => w.projects.filter((p) => !p.exists)) ?? [];

  return (
    <Section
      icon={<FileUp size={16} className="text-accent" />}
      title="Import a plan"
      description="Load workspaces, labels, projects, pages and items from a Laneway import file (JSON). You see what it will add before anything is saved. Projects you already have are left alone, so importing the same file twice is safe."
    >
      <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium shadow-card hover:bg-surface-2">
        <FileUp size={14} />
        {file ? file.name : "Choose a file…"}
        <input
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      {problems.length ? (
        <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-[13px]">
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            <AlertCircle size={14} className="text-danger" /> Fix these in the file, then choose it again:
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-muted">
            {problems.slice(0, 10).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview ? (
        <div className="mt-4 flex flex-col gap-3">
          {preview.workspaces.map((w) => (
            <div key={w.name} className="rounded-lg border border-line p-3">
              <p className="text-[13px] font-medium">
                {w.into ? (
                  w.into.name === w.name ? (
                    <>Into your {w.into.name} workspace</>
                  ) : (
                    <>
                      {w.name} goes into your {w.into.name} workspace
                    </>
                  )
                ) : (
                  <>New workspace: {w.name}</>
                )}
              </p>
              {w.labelsToAdd.length ? (
                <p className="mt-0.5 text-[12px] text-muted">New labels: {w.labelsToAdd.join(", ")}</p>
              ) : null}
              <ul className="mt-2 flex flex-col gap-1 text-[13px]">
                {w.projects.map((p) => (
                  <li key={p.name} className={cn("flex items-baseline gap-2", p.exists && "text-faint")}>
                    <span className="w-14 shrink-0 font-mono text-[11px] text-faint">{p.key}</span>
                    <span className="flex-1">{p.name}</span>
                    <span className="text-[12px] text-muted">
                      {p.exists
                        ? "already there, skipped"
                        : `${p.items} item${p.items === 1 ? "" : "s"}${p.pages ? `, ${p.pages} page${p.pages === 1 ? "" : "s"}` : ""}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={pending || problems.length > 0 || newProjects.length === 0}
              onClick={run}
            >
              Import {newProjects.length} project{newProjects.length === 1 ? "" : "s"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => choose(undefined)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {done ? (
        <div className="mt-4 rounded-lg border border-line p-3 text-[13px]">
          <p className="mb-1.5 flex items-center gap-1.5 font-medium">
            <Check size={14} className="text-accent" /> Imported
          </p>
          <ul className="flex flex-col gap-1">
            {done.projects.map((p) => (
              <li key={p.id} className="flex items-baseline gap-2">
                <span className="w-14 shrink-0 font-mono text-[11px] text-faint">{p.key}</span>
                <Link href={`/w/${p.workspaceId}/p/${p.id}`} className="flex-1 hover:underline">
                  {p.name}
                </Link>
                <span className="text-[12px] text-muted">{p.workspace}</span>
              </li>
            ))}
          </ul>
          {done.skipped.length ? (
            <p className="mt-2 text-[12px] text-faint">Skipped, already there: {done.skipped.join(", ")}</p>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}
