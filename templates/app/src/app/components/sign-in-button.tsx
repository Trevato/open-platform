"use client";

import { authClient } from "@/lib/auth-client";

export function SignInButton() {
  return (
    <button
      className="btn btn-accent"
      onClick={() =>
        authClient.signIn.oauth2({ providerId: "forgejo", callbackURL: "/" })
      }
    >
      Sign in
    </button>
  );
}

export function SignOutButton() {
  return (
    <button
      className="btn btn-ghost"
      onClick={() =>
        authClient.signOut({
          fetchOptions: { onSuccess: () => window.location.reload() },
        })
      }
    >
      Sign out
    </button>
  );
}
