import {
  ApiError,
  addComment,
  agenda,
  appUrl,
  authenticate,
  createItem,
  findItems,
  getItem,
  getProject,
  listProjects,
  listWorkspaces,
  updateItem,
} from "@/lib/api";

/**
 * Laneway's REST API. Authenticate with a personal token from Settings:
 *   Authorization: Bearer lw_…
 *
 *   GET   /api/v1/workspaces
 *   GET   /api/v1/projects?workspace=<id>
 *   GET   /api/v1/projects/<id or key>          statuses and labels too
 *   GET   /api/v1/items?project=&workspace=&q=&status=&label=&open=1&due_before=&limit=
 *   POST  /api/v1/items                          { project, title, description?, status?,
 *                                                  priority?, startDate?, dueDate?, labels?, parent? }
 *   GET   /api/v1/items/<id or key>              e.g. /api/v1/items/ALI-12
 *   PATCH /api/v1/items/<id or key>              { title?, description?, status?, priority?,
 *                                                  startDate?, dueDate?, labels?, addLabels?, removeLabels? }
 *   POST  /api/v1/items/<id or key>/comments     { body }
 *   GET   /api/v1/agenda?days=7                  overdue, due soon, in progress
 */

type Ctx = RouteContext<"/api/v1/[...path]">;

async function handle(request: Request, ctx: Ctx, method: "GET" | "POST" | "PATCH") {
  try {
    const caller = await authenticate(request);
    const { path } = await ctx.params;
    const url = new URL(request.url);
    const q = url.searchParams;
    const base = appUrl(request);
    const [resource, ref, sub] = path;

    const body = async () => {
      try {
        const data = await request.json();
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
        return data as Record<string, unknown>;
      } catch {
        throw new ApiError("Send a JSON object as the request body.");
      }
    };

    if (method === "GET" && resource === "workspaces" && !ref) {
      return ok({ workspaces: await listWorkspaces(caller) });
    }
    if (method === "GET" && resource === "projects" && !ref) {
      return ok({ projects: await listProjects(caller, q.get("workspace")) });
    }
    if (method === "GET" && resource === "projects" && ref && !sub) {
      return ok({ project: await getProject(caller, ref) });
    }
    if (method === "GET" && resource === "items" && !ref) {
      const items = await findItems(
        caller,
        {
          workspace: q.get("workspace"),
          project: q.get("project"),
          query: q.get("q"),
          status: q.get("status"),
          label: q.get("label"),
          open: q.get("open") === "1" || q.get("open") === "true",
          dueBefore: q.get("due_before"),
          limit: q.get("limit") ? Number(q.get("limit")) : null,
        },
        base,
      );
      return ok({ items });
    }
    if (method === "POST" && resource === "items" && !ref) {
      const b = await body();
      const item = await createItem(
        caller,
        {
          project: str(b.project, "project"),
          title: str(b.title, "title"),
          description: opt(b.description),
          status: opt(b.status),
          priority: opt(b.priority),
          startDate: optDate(b.startDate),
          dueDate: optDate(b.dueDate),
          labels: list(b.labels),
          parent: opt(b.parent),
        },
        base,
      );
      return ok({ item }, 201);
    }
    if (method === "GET" && resource === "items" && ref && !sub) {
      return ok({ item: await getItem(caller, ref, base) });
    }
    if (method === "PATCH" && resource === "items" && ref && !sub) {
      const b = await body();
      const item = await updateItem(
        caller,
        ref,
        {
          title: opt(b.title),
          description: opt(b.description),
          status: opt(b.status),
          priority: opt(b.priority),
          startDate: optDate(b.startDate),
          dueDate: optDate(b.dueDate),
          labels: b.labels === undefined ? undefined : list(b.labels),
          addLabels: list(b.addLabels),
          removeLabels: list(b.removeLabels),
        },
        base,
      );
      return ok({ item });
    }
    if (method === "POST" && resource === "items" && ref && sub === "comments") {
      const b = await body();
      return ok({ item: await addComment(caller, ref, str(b.body, "body"), base) }, 201);
    }
    if (method === "GET" && resource === "agenda" && !ref) {
      return ok(await agenda(caller, Number(q.get("days") ?? 7) || 7, base));
    }
    throw new ApiError(`No such endpoint: ${method} /api/v1/${path.join("/")}`, 404);
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("api error", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

function ok(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function str(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(`${field} is required.`);
  return value;
}

function opt(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ApiError("Expected text.");
  return value;
}

function optDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new ApiError("Dates look like 2026-11-30.");
  return value;
}

function list(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string") || value.length > 30) {
    throw new ApiError("Labels are a list of label names.");
  }
  return value as string[];
}

export const GET = (request: Request, ctx: Ctx) => handle(request, ctx, "GET");
export const POST = (request: Request, ctx: Ctx) => handle(request, ctx, "POST");
export const PATCH = (request: Request, ctx: Ctx) => handle(request, ctx, "PATCH");
