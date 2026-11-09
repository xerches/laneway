// Copies generated SQL from ./drizzle into netlify/database/migrations.
// Netlify applies that folder on every deploy; `npm run db:migrate` applies
// the same files to any other Postgres (local, Supabase, Neon).
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const from = "drizzle";
const to = join("netlify", "database", "migrations");
mkdirSync(to, { recursive: true });

let copied = 0;
for (const file of readdirSync(from).filter((f) => f.endsWith(".sql")).sort()) {
  const target = join(to, file);
  if (existsSync(target)) continue; // never touch a migration that may be applied
  copyFileSync(join(from, file), target);
  copied += 1;
  console.log(`added ${target}`);
}
console.log(copied ? `${copied} new migration(s)` : "no new migrations");
