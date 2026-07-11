import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import type { Db } from "@/db/client";

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn(
    "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set — Google sign-in will fail. See .env.example.",
  );
}

// Factory so tests can build an instance with test-only options (see
// src/test/auth-test-utils.ts) while sharing the adapter wiring.
export function createAuth(
  database: Db,
  options?: { emailAndPassword?: { enabled: boolean } },
) {
  return betterAuth({
    database: drizzleAdapter(database, { provider: "pg" }),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      },
    },
    ...options,
  });
}

export const auth = createAuth(db);
