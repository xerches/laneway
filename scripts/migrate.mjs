// Applies netlify/database/migrations/*.sql to the database in DATABASE_URL.
// Use this for local development and for hosts other than Netlify.
// On Netlify, the platform applies the same folder itself during deploys.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (put it in .env.local).");
  process.exit(1);
}

const dir = join("netlify", "database", "migrations");
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
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
