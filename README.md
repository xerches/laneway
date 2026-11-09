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
- **Dashboard**: what's due today, overdue, in progress and done this week,
  across everything or one workspace.
- **Inbox** for things that need you, plus notifications.
- **Email to a project**: each project has a private address that turns an
  incoming message into an item (see below).
- **Templates** so a new project takes seconds, not a setup wizard.
- Search and shortcuts: `Ctrl/⌘ K` to search, `C` for a new item, `1` `2` `3`
  to switch views.
- Works on a phone browser, in light and dark mode.

Planned next: timeline, dependencies, time tracking, automations, GitHub and
ClickUp connections, then teams.

## Run it on your computer

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
| `DATABASE_URL` | Postgres connection string. Not needed on Netlify. |
| `BETTER_AUTH_SECRET` | Long random secret that signs login sessions. Required. |
| `BETTER_AUTH_URL` | The address of the app. Needed locally, optional on Netlify. |
| `SIGNUPS` | Set to `open` to let anyone create an account. Leave unset to keep it private. |

## Put it online (Netlify)

1. Create a Netlify project from this repository.
2. Add `BETTER_AUTH_SECRET` under Project configuration, Environment variables.
3. Deploy. Netlify creates the database and applies everything in
   `netlify/database/migrations` by itself.
4. Open the site and create your account straight away, so the installation is
   yours.

If you later add your own domain, redeploy once so sign-in picks up the new
address (or set `BETTER_AUTH_URL` to it).

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

## For developers

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app locally. |
| `npm run build` | Production build. |
| `npm run lint` | Lint. |
| `npm run typecheck` | Type-check. |
| `npm run db:generate` | After editing `src/db/schema.ts`: write a new migration. |
| `npm run db:migrate` | Apply migrations to the database in `DATABASE_URL`. |

Built with Next.js (App Router), React, TypeScript, Tailwind CSS, Postgres with
Drizzle ORM, and Better Auth.

Where things live:

- `src/db/schema.ts`: the tables.
- `src/lib/data.ts`: every read. Each one checks the reader belongs to the workspace.
- `src/lib/mutations.ts`: every write, with the same check.
- `src/actions/index.ts`: what the browser is allowed to call.
- `src/components/project/`: board, list, calendar and the item panel.
- `src/components/dashboard/`: home dashboard and inbox.
- `netlify/database/migrations/`: SQL migrations. Never edit one that has
  already been applied; add a new one instead.

Migrations are generated into `drizzle/` and copied to
`netlify/database/migrations/` by `npm run db:generate`. Do not run
`drizzle-kit push` or `drizzle-kit migrate` against a hosted database; hosted
databases only change through the committed migration files.
