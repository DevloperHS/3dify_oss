import { describe, expect, it } from "vitest";
import { getCurrentUser } from "./session";
import { signedInHeaders, signOut } from "@/test/auth-test-utils";

describe("getCurrentUser", () => {
  it("returns null for a request with no session", async () => {
    const user = await getCurrentUser(new Headers());
    expect(user).toBeNull();
  });

  it("returns the signed-in user's identity for a request with a valid session", async () => {
    const email = `alice-${Date.now()}@example.com`;
    const headers = await signedInHeaders(email, "Alice");

    const user = await getCurrentUser(headers);

    expect(user).not.toBeNull();
    expect(user?.email).toBe(email);
    expect(user?.name).toBe("Alice");
    expect(user?.id).toBeTruthy();
  });

  it("returns null after the user signs out", async () => {
    const email = `bob-${Date.now()}@example.com`;
    const headers = await signedInHeaders(email, "Bob");
    await signOut(headers);

    const user = await getCurrentUser(headers);

    expect(user).toBeNull();
  });
});
