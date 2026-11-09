import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { count } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

/**
 * Where this Laneway lives. BETTER_AUTH_URL wins when set. Otherwise the
 * addresses the host gave this deploy at build time are used (see
 * next.config.ts), so the main address and preview links all work. With
 * neither, the address is taken from each request.
 */
function resolveBaseURL() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  const urls = (process.env.LANEWAY_DEPLOY_URLS ?? "").split(",").filter(Boolean);
  if (urls.length === 0) return undefined;
  return {
    allowedHosts: urls.map((url) => new URL(url).host),
    fallback: urls[0],
    protocol: urls[0].startsWith("https:") ? ("https" as const) : ("http" as const),
  };
}

/**
 * Sign-ups are closed by default: the first person to create an account owns
 * this installation, and nobody else can register. Set SIGNUPS=open to allow
 * anyone to sign up (needed once Laneway is offered to other people).
 */
async function signupsAllowed(): Promise<boolean> {
  if (process.env.SIGNUPS === "open") return true;
  const [row] = await db.select({ n: count() }).from(schema.user);
  return (row?.n ?? 0) === 0;
}

export const auth = betterAuth({
  baseURL: resolveBaseURL(),
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!(await signupsAllowed())) {
            throw new APIError("FORBIDDEN", {
              message: "Sign-ups are closed for this Laneway.",
            });
          }
          return { data: user };
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export { signupsAllowed };
