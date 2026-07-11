import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import type { Db } from "@/db/client";

// Factory so tests can stand up an auth instance against the test database.
export function createAuth(database: Db) {
  return betterAuth({
    database: drizzleAdapter(database, { provider: "pg" }),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      },
    },
  });
}

export const auth = createAuth(db);
