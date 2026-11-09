import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// DATABASE_URL works with any Postgres (local, Supabase, Neon).
// On Netlify, Netlify Database sets NETLIFY_DB_URL automatically.
const connectionString =
  process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL;

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { __lanewayPool?: Pool };

const pool =
  globalForDb.__lanewayPool ??
  new Pool({ connectionString, max: 5, idleTimeoutMillis: 20_000 });

if (process.env.NODE_ENV !== "production") globalForDb.__lanewayPool = pool;

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
export { schema };
