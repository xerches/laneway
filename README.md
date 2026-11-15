# Laneway

A project board for the three parts of your life: personal, your day job, and
your own business. Colourful and quick to set up, with the tracking you'd
expect from a heavier tool.

This is phase 1 (the personal MVP). What works today:

- **Three workspaces** kept apart from each other, each with its own projects.
- **Board, list and calendar** views of the same items. Drag cards between
  columns or days; edit any cell in the list in place.
- **Items** with status, priority, owner, start and due dates, a description,
  subtasks and a comment thread. Every change is logged in the item's activity.
- **Recurring items**: finish one and the next copy appears with its new date.
- **Dashboards** you arrange yourself: one across everything and one per
  workspace. Pick from counters, lists (up next, due soon, overdue, next 14
  days), project progress, recent activity, and charts (items by status,
  priority or label, done per week, and a burn-up). Drag to reorder, make a
  widget wide, and narrow any chart to one project.
- **Inbox** for things that need you, plus notifications.
- **Email to a project**: each project has a private address that turns an
  incoming message into an item (see below).
- **Templates** so a new project takes seconds, not a setup wizard.
- **Labels**, shared across a workspace's projects, with colors. Filter any
  view by label, priority, or hide what's done.
- **Links** on items: web pages, GitHub, and `obsidian://` notes that open
  straight in Obsidian.
- **Timeline**: a Gantt chart of everything with dates. Drag a bar to move it,
  or drag its ends to change the start or due date.
- **My week**: what's overdue, due each day and in progress, across every
  workspace.
- **Pages** in every project: Markdown notes with tables and checklists you
  can tick while reading. Start blank or from a template (project brief,
  meeting notes, decision record, weekly review, trip plan), or save your own.
- **Item templates**: save any item, with its labels, priority and subtasks,
  and make new ones from it under New item.
- **Automations**, Jira-style: "when this happens, if this is true, do that".
  Trigger on a new item, a status, priority or label change, a coming due
  date, or a schedule. Set status, priority, labels, owner or due date,
  comment, add a subtask, notify, or move to another project. Every rule has
  a run log and a "Test on an item" button. Find them in a workspace's menu.
- **API and MCP** for scripts and AI assistants (Claude, Luna): read your
  agenda, search, create and update items, and comment. Each token can be
  kept to some workspaces, and its changes show as "You via <token name>".
- **Import a plan** from a JSON file: workspaces, labels, projects, pages and
  items in one go, with a preview first. Safe to run twice.
- **GitHub**: mention an item key like `ALI-12` in a pull request and the item
  gets a link to it; when the PR merges, the item can move to done.
- Search and shortcuts: `Ctrl/⌘ K` to search, `C` for a new item, `1` to `5`
  to switch views.
- Works on a phone browser, in light and dark mode.

Planned next: a ClickUp import, then teams.

## Host it yourself (recommended)

Laneway runs on your own computer with Docker Desktop: the app, its database
and a nightly backup, reachable from your phone and laptop through Tailscale.
It's free and private. See [SELF-HOSTING.md](SELF-HOSTING.md); on Windows it's
one script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

## Run it for development

You need [Node.js](https://nodejs.org) 20.12 or newer and a Postgres database.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run db:migrate           # creates the tables
npm run dev                  # open http://localhost:3000
```

The first account you create owns the installation. After that, sign-ups are
closed unless you set `SIGNUPS=open`.

## Settings

| Name | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Set for you by Neon on Vercel; not needed on Netlify. |
| `BETTER_AUTH_SECRET` | Long random secret that signs login sessions. Required. |
| `BETTER_AUTH_URL` | The address of the app. Needed locally, optional on Vercel and Netlify. |
| `LANEWAY_URLS` | Self-hosted only: every address you open Laneway at, comma-separated. |
| `CRON_SECRET` | Optional. Protects `/api/cron/automations`, which runs due-date and scheduled rules. Defaults to `BETTER_AUTH_SECRET`. |
| `LANEWAY_SCHEDULER` | Set to `0` to stop a long-running server from running timed rules itself every 15 minutes. |
| `TZ` | The time zone timed rules use, such as `America/New_York`. |
| `SIGNUPS` | Set to `open` to let anyone create an account. Leave unset to keep it private. |

## Put it online (Vercel and Neon, free for personal use)

1. Sign in at [vercel.com](https://vercel.com) with GitHub, choose **Add New,
   Project**, and import this repository. Leave the build settings as they are.
2. Before the first deploy finishes (or right after, if it fails for lack of a
   database), open the project's **Storage** tab, choose **Neon**, create a
   free database, and connect it to the project for all environments. This
   adds `DATABASE_URL` for you.
3. Under **Settings, Environment Variables**, add `BETTER_AUTH_SECRET` with a
   long random value (for example from `openssl rand -base64 32`).
4. Redeploy. Each build creates or updates the tables first
   (`npm run vercel-build`), then builds the app.
5. Open the site and create your account straight away, so the installation is
   yours.

Every merge to `main` then deploys by itself. If you add your own domain,
redeploy once so sign-in picks up the new address (or set `BETTER_AUTH_URL`).

Vercel's free Hobby plan is for personal, non-commercial use. Once Alimi uses
Laneway as a business, move to Vercel Pro or another host.

### Netlify instead

Netlify also works: create a project from this repository, add
`BETTER_AUTH_SECRET`, and deploy. Netlify creates the database and applies
everything in `netlify/database/migrations` by itself.

## Email to a project

Open a project, choose **Email to this project** from its menu, and copy the
address shown. It is a web address, not a mailbox: point an email service's
"inbound webhook" at it (Postmark, Mailgun, SendGrid and Cloudflare Email
Workers can all do this), and each message becomes an item in the project's
first column, with the subject as the title and the message as the
description. Treat the address like a password; anyone who has it can add
items to that project.

You can try it without an email service:

```bash
curl -X POST "<the address>" \
  -H "content-type: application/json" \
  -d '{"from":"someone@example.com","subject":"Hello","text":"First item by email"}'
```

## Import a plan

Settings → **Import a plan** loads a JSON file like this one. You see what it
will add before anything is saved. Workspaces are matched to yours by name,
then by kind; projects you already have (same name) are skipped.

```json
{
  "version": 1,
  "workspaces": [
    {
      "name": "Personal",
      "kind": "personal",
      "labels": [{ "name": "waiting", "color": "amber" }],
      "projects": [
        {
          "name": "Kitchen refit",
          "key": "KIT",
          "color": "teal",
          "pages": [{ "title": "Overview", "body": "Budget and contacts…" }],
          "items": [
            {
              "title": "Get three quotes",
              "status": "To do",
              "priority": "high",
              "labels": ["waiting"],
              "startDate": "2026-12-01",
              "dueDate": "2026-12-12",
              "links": [{ "url": "obsidian://open?vault=Notes&file=Kitchen", "title": "Kitchen note" }],
              "subtasks": ["Ask Sam for a builder", "Book visits"]
            }
          ]
        }
      ]
    }
  ]
}
```

Projects get Backlog, To do, In progress, Blocked and Done unless the file
lists its own `statuses` (`name`, `color`, `category`: todo, active or done).
Colors: gray, red, orange, amber, green, teal, blue, indigo, violet, pink.

## API, Claude and GitHub

Open **Settings** (the gear next to your name) to set these up.

**Tokens.** Make one token per tool, and tick only the workspaces it needs.
Work workspaces start unticked, so a personal assistant can't see your day
job unless you say so. The token is shown once; revoke it any time.

**Claude and other MCP clients.** Laneway serves MCP over Streamable HTTP at
`/api/mcp`. For Claude Code:

```bash
claude mcp add --transport http laneway https://<your laneway>/api/mcp \
  --header "Authorization: Bearer lw_…"
```

Tools: `agenda`, `list_workspaces`, `list_projects`, `get_project`,
`search_items`, `get_item`, `create_item`, `update_item`, `add_comment`.

**REST API.** The same things under `/api/v1`, with the token in an
`Authorization: Bearer` header:

| Request | What it does |
| --- | --- |
| `GET /api/v1/agenda?days=7` | Overdue, due soon and in progress. |
| `GET /api/v1/workspaces` | Workspaces the token can see. |
| `GET /api/v1/projects` | Projects with progress (`?workspace=` to narrow). |
| `GET /api/v1/projects/WEDD` | One project by key, name or id, with its statuses and labels. |
| `GET /api/v1/items?q=&project=&status=&label=&due_before=&open=true` | Search items. |
| `POST /api/v1/items` | Create: `{"project","title","status","priority","dueDate","labels":[…]}`. |
| `GET /api/v1/items/WEDD-4` | One item with subtasks, links and comments. |
| `PATCH /api/v1/items/WEDD-4` | Change title, status, priority, dates or labels (`addLabels`, `removeLabels`). |
| `POST /api/v1/items/WEDD-4/comments` | Comment: `{"body"}`. |

Statuses and labels are matched by name. Changes run automations just like
changes in the app.

**GitHub.** Add a webhook for a workspace in Settings, then in the
repository open Settings → Webhooks → Add webhook: paste the payload URL and
secret, choose `application/json`, and pick only the **Pull requests** event.
Pull requests that mention an item key (in the title, description or branch
name, such as `wedd-4-contract`) link to the item, and a merge moves it to
the project's first done status unless you set the webhook to just note it.
GitHub must be able to reach Laneway. If it's only on your Tailscale network,
use Tailscale Funnel on a separate port so that only the webhook path is
public, not the whole app:

```bash
tailscale funnel --bg --https=8443 --set-path /api/integrations/github \
  http://127.0.0.1:3000/api/integrations/github
```

Then give GitHub `https://<machine>.<tailnet>.ts.net:8443/api/integrations/github/<webhook id>`
as the payload URL. Each delivery is checked against the webhook's secret.

## For developers

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app locally. |
| `npm run build` | Production build. |
| `npm run lint` | Lint. |
| `npm run typecheck` | Type-check. |
| `npm run db:generate` | After editing `src/db/schema.ts`: write a new migration. |
| `npm run db:migrate` | Apply migrations to the database in `DATABASE_URL`. |
| `npm run vercel-build` | What Vercel runs: apply migrations, then build. |

Built with Next.js (App Router), React, TypeScript, Tailwind CSS, Postgres with
Drizzle ORM, and Better Auth.

Where things live:

- `src/db/schema.ts`: the tables.
- `src/lib/data.ts`: every read. Each one checks the reader belongs to the workspace.
- `src/lib/mutations.ts`: every write, with the same check.
- `src/actions/index.ts`: what the browser is allowed to call.
- `src/components/project/`: board, list, calendar and the item panel.
- `src/components/dashboard/`: dashboards, their widgets and charts, and the inbox.
- `src/lib/widgets.ts`: the widget catalog and the default layout.
- `src/lib/automations.ts`: the automation engine; `src/lib/automation-types.ts`: rule shapes and plain-English descriptions.
- `netlify/database/migrations/`: SQL migrations. Never edit one that has
  already been applied; add a new one instead.

Migrations are generated into `drizzle/` and copied to
`netlify/database/migrations/` by `npm run db:generate`. Do not run
`drizzle-kit push` or `drizzle-kit migrate` against a hosted database; hosted
databases only change through the committed migration files.
