"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignInButton() {
  return (
    <button
      className="rounded-md bg-foreground px-4 py-2 text-background hover:opacity-90"
      onClick={() => authClient.signIn.social({ provider: "google" })}
    >
      Sign in with Google
    </button>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="rounded-md border border-foreground/20 px-4 py-2 hover:bg-foreground/5"
      onClick={async () => {
        await authClient.signOut();
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
