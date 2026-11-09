import { defineConfig } from "drizzle-kit";

// `npm run db:generate` writes SQL here, then copies it to
// netlify/database/migrations, which is the folder that actually gets applied.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
