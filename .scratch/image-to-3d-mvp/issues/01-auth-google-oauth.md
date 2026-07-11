# 01 — Auth: Google OAuth sign-in

**What to build:** A signed-out visitor can sign in with their Google account and reach a signed-in state that persists across visits. No email/password path exists. This is the foundation every other ticket depends on — Jobs and Assets are owned by a User.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Signed-out visitor sees a "Sign in with Google" entry point
- [ ] Completing Google OAuth creates a User row (or matches an existing one) and establishes a session
- [ ] Signed-in state persists across a page reload
- [ ] Signed-in user can sign out, returning to signed-out state
- [ ] No email/password fields exist anywhere in the auth flow
