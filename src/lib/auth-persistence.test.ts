import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { signedInHeaders } from "@/test/auth-test-utils";

// Seam 2: completing a sign-in persists a User row against our schema.
// Guards the hand-written Drizzle schema against drift from what Better Auth
// actually writes — if a column is missing or misnamed, sign-in fails here.

describe("sign-in persistence", () => {
  it("creates a User row with the signed-in identity", async () => {
    const email = `carol-${Date.now()}@example.com`;
    await signedInHeaders(email, "Carol");

    const rows = await db.select().from(user).where(eq(user.email, email));

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Carol");
    expect(rows[0].id).toBeTruthy();
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it("a repeat sign-in matches the existing User row instead of duplicating it", async () => {
    const email = `dave-${Date.now()}@example.com`;
    await signedInHeaders(email, "Dave");
    await signedInHeaders(email, "Dave");

    const rows = await db.select().from(user).where(eq(user.email, email));

    expect(rows).toHaveLength(1);
  });
});
