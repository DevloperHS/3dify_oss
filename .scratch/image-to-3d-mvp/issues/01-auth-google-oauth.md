# 01 — Auth: Google OAuth sign-in

**What to build:** A signed-out visitor can sign in with their Google account and reach a signed-in state that persists across visits. No email/password path exists. This is the foundation every other ticket depends on — Jobs and Assets are owned by a User.

**Blocked by:** None — can start immediately

**Status:** closed — implemented and reviewed (commits 08eabb0, c9b10e9). One manual step remains for the live flow: create Google OAuth credentials at console.cloud.google.com and set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET in .env (redirect URI: http://localhost:3000/api/auth/callback/google), then verify the real Google round-trip in a browser.

- [x] Signed-out visitor sees a "Sign in with Google" entry point (verified: page renders the button)
- [x] Completing Google OAuth creates a User row (or matches an existing one) and establishes a session (automated: persistence + no-duplicate tests against real Postgres; live Google round-trip pending credentials — see note above)
- [x] Signed-in state persists across a page reload (automated: valid session cookie → identity via getCurrentUser)
- [x] Signed-in user can sign out, returning to signed-out state (automated: session invalidated after sign-out)
- [x] No email/password fields exist anywhere in the auth flow (confirmed by spec review; email/password exists only in a test-only helper under src/test/)
