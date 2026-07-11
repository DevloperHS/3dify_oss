import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";

// Test-only auth instance: same database, adapter, and secret as the app's real
// instance, but with email/password enabled so tests can create signed-in
// sessions without a live Google OAuth round-trip. Sessions it creates are
// indistinguishable at the database level from OAuth-created ones.
const testAuth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
});

// Signs up (or signs in) a test user and returns request headers carrying
// their session cookie, ready to pass to the seam under test.
export async function signedInHeaders(
  email: string,
  name: string,
): Promise<Headers> {
  const password = "test-password-123";
  let response = await testAuth.api.signUpEmail({
    body: { email, password, name },
    asResponse: true,
  });
  if (!response.ok) {
    // Email already registered — this is a repeat sign-in.
    response = await testAuth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
  }
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("sign-up/sign-in returned no session cookie");
  }
  const sessionCookie = setCookie.split(";")[0];
  return new Headers({ cookie: sessionCookie });
}

// Ends the session carried by the given headers, mirroring the app's sign-out.
export async function signOut(headers: Headers): Promise<void> {
  await testAuth.api.signOut({ headers });
}
