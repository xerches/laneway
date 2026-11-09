// Applies netlify/database/migrations/*.sql to the database in DATABASE_URL.
// Runs locally (npm run db:migrate) and before every Vercel build
// (npm run vercel-build). On Netlify, the platform applies the folder itself.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

// A direct (unpooled) connection is safer for schema changes when the host
// offers one, as Neon does.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set. Locally, put it in .env.local. On Vercel, connect a Neon database under Storage.",
  );
  process.exit(1);
}

const dir = join("netlify", "database", "migrations");
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  // Two builds can start at once (a preview and production); take turns.
  await client.query("select pg_advisory_lock(727274)");
  await client.query(
    `create table if not exists _laneway_migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const { rows } = await client.query("select name from _laneway_migrations");
  const applied = new Set(rows.map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into _laneway_migrations (name) values ($1)", [file]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
    count += 1;
    console.log(`applied ${file}`);
  }
  console.log(count ? `${count} migration(s) applied` : "database is up to date");
} finally {
  await client.end();
}
