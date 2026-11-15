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
  type ApiCaller,
} from "@/lib/api";

/**
 * An MCP server (Streamable HTTP, stateless JSON responses) so assistants
 * like Luna and Claude can read and update the board. It uses the same
 * personal API tokens as the REST API:
 *
 *   claude mcp add --transport http laneway https://<your laneway>/api/mcp \
 *     --header "Authorization: Bearer lw_…"
 */

const SERVER = { name: "laneway", version: "1.0.0" };
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const text = (description: string) => ({ type: "string", description });
const dateField = (description: string) => ({ type: "string", description: `${description} (YYYY-MM-DD, or empty to clear)` });
const names = (description: string) => ({ type: "array", items: { type: "string" }, description });

const TOOLS = [
  {
    name: "agenda",
    description: "What needs attention across your workspaces: overdue items, items due in the next N days, and items in progress. Start here for 'what's on my plate'.",
    inputSchema: { type: "object", properties: { days: { type: "number", description: "How many days ahead to look (default 7)." } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_workspaces",
    description: "The workspaces this token can see (for example Personal and a business).",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_projects",
    description: "Projects with their key (used in item keys like ALI-12) and progress. Optionally only one workspace.",
    inputSchema: { type: "object", properties: { workspace: text("Workspace id.") } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_project",
    description: "One project by id, key or name, with its statuses (in order) and the labels you can use.",
    inputSchema: { type: "object", properties: { project: text("Project id, key (e.g. WEDD) or name.") }, required: ["project"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "search_items",
    description: "Find items. All filters are optional and combine. Results are sorted by due date.",
    inputSchema: {
      type: "object",
      properties: {
        query: text("Words in the title or description."),
        project: text("Project id, key or name."),
        workspace: text("Workspace id."),
        status: text("A status name, or todo / active / done."),
        label: text("A label name."),
        open_only: { type: "boolean", description: "Only items that aren't done." },
        due_before: text("Only items due on or before this date (YYYY-MM-DD)."),
        limit: { type: "number", description: "Up to 200, default 50." },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_item",
    description: "One item by key (e.g. ALI-12) or id, with its subtasks and latest comments.",
    inputSchema: { type: "object", properties: { item: text("Item key or id.") }, required: ["item"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "create_item",
    description: "Create an item in a project. Status and labels are matched by name; use get_project to see the choices.",
    inputSchema: {
      type: "object",
      properties: {
        project: text("Project id, key or name."),
        title: text("Short title."),
        description: text("Markdown notes."),
        status: text("Status name, or todo / active / done."),
        priority: { type: "string", enum: ["none", "low", "medium", "high", "urgent"] },
        start_date: dateField("Start date"),
        due_date: dateField("Due date"),
        labels: names("Label names."),
        parent: text("Make it a subtask of this item (key or id)."),
      },
      required: ["project", "title"],
    },
  },
  {
    name: "update_item",
    description: "Change an item: title, description, status (e.g. move to Done), priority, dates or labels. Only the fields you pass change.",
    inputSchema: {
      type: "object",
      properties: {
        item: text("Item key or id."),
        title: text("New title."),
        description: text("New description (replaces the old one)."),
        status: text("Status name, or todo / active / done."),
        priority: { type: "string", enum: ["none", "low", "medium", "high", "urgent"] },
        start_date: dateField("Start date"),
        due_date: dateField("Due date"),
        add_labels: names("Label names to add."),
        remove_labels: names("Label names to remove."),
      },
      required: ["item"],
    },
    annotations: { destructiveHint: false },
  },
  {
    name: "add_comment",
    description: "Add a comment to an item, for example a progress note.",
    inputSchema: { type: "object", properties: { item: text("Item key or id."), body: text("The comment.") }, required: ["item", "body"] },
  },
];

type Args = Record<string, unknown>;

const s = (a: Args, k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);
const arr = (a: Args, k: string) =>
  Array.isArray(a[k]) ? (a[k] as unknown[]).filter((v): v is string => typeof v === "string") : undefined;
const date = (a: Args, k: string) => (a[k] === "" ? null : s(a, k));

async function callTool(caller: ApiCaller, name: string, a: Args, base: string): Promise<unknown> {
  switch (name) {
    case "agenda":
      return agenda(caller, typeof a.days === "number" ? a.days : 7, base);
    case "list_workspaces":
      return { workspaces: await listWorkspaces(caller) };
    case "list_projects":
      return { projects: await listProjects(caller, s(a, "workspace")) };
    case "get_project":
      return getProject(caller, s(a, "project") ?? "");
    case "search_items":
      return {
        items: await findItems(
          caller,
          {
            query: s(a, "query"),
            project: s(a, "project"),
            workspace: s(a, "workspace"),
            status: s(a, "status"),
            label: s(a, "label"),
            open: a.open_only === true,
            dueBefore: s(a, "due_before"),
            limit: typeof a.limit === "number" ? a.limit : null,
          },
          base,
        ),
      };
    case "get_item":
      return getItem(caller, s(a, "item") ?? "", base);
    case "create_item":
      return createItem(
        caller,
        {
          project: s(a, "project") ?? "",
          title: s(a, "title") ?? "",
          description: s(a, "description"),
          status: s(a, "status"),
          priority: s(a, "priority"),
          startDate: date(a, "start_date"),
          dueDate: date(a, "due_date"),
          labels: arr(a, "labels"),
          parent: s(a, "parent"),
        },
        base,
      );
    case "update_item":
      return updateItem(
        caller,
        s(a, "item") ?? "",
        {
          title: s(a, "title"),
          description: s(a, "description"),
          status: s(a, "status"),
          priority: s(a, "priority"),
          startDate: date(a, "start_date"),
          dueDate: date(a, "due_date"),
          addLabels: arr(a, "add_labels"),
          removeLabels: arr(a, "remove_labels"),
        },
        base,
      );
    case "add_comment":
      return addComment(caller, s(a, "item") ?? "", s(a, "body") ?? "", base);
    default:
      throw new ApiError(`Unknown tool: ${name}`);
  }
}

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Args };

async function respond(caller: ApiCaller, msg: RpcRequest, base: string) {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });

  switch (msg.method) {
    case "initialize": {
      const asked = typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "";
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions:
          `Laneway is ${caller.name}'s project board. Changes you make show in its activity as "${caller.name} via ${caller.tokenName}". Items have keys like ALI-12 (project key + number). Use agenda for what's due, search_items to find work, get_project to see a project's statuses and labels before creating or moving items.`,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = typeof msg.params?.name === "string" ? msg.params.name : "";
      const args = (msg.params?.arguments ?? {}) as Args;
      try {
        const result = await callTool(caller, name, args, base);
        return reply({
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        });
      } catch (error) {
        if (error instanceof ApiError) {
          return reply({ content: [{ type: "text", text: error.message }], isError: true });
        }
        console.error("mcp tool failed", error);
        return reply({ content: [{ type: "text", text: "Something went wrong." }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(request: Request) {
  let caller: ApiCaller;
  try {
    caller = await authenticate(request);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Unauthorized";
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message } },
      { status: 401, headers: { "www-authenticate": 'Bearer realm="laneway"' } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  const base = appUrl(request);
  const batch = Array.isArray(payload) ? payload : [payload];
  const out: unknown[] = [];
  for (const raw of batch.slice(0, 20)) {
    const msg = raw as RpcRequest;
    if (!msg || typeof msg !== "object" || typeof msg.method !== "string") {
      out.push({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } });
      continue;
    }
    // Notifications (no id) get no answer.
    if (msg.id === undefined || msg.method.startsWith("notifications/")) continue;
    out.push(await respond(caller, msg, base));
  }

  if (out.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(payload) ? out : out[0], {
    headers: { "cache-control": "no-store" },
  });
}

export function GET() {
  // No server-to-client stream: every answer comes back on the POST.
  return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
