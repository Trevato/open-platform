"use client";

import { authClient } from "@/lib/auth-client";

export function SignInButton() {
  return (
    <button
      onClick={() =>
        authClient.signIn.oauth2({ providerId: "forgejo", callbackURL: "/" })
      }
      style={{
        padding: "8px 16px",
        background: "#6c5ce7",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        transition: "opacity 0.15s",
      }}
    >
      Sign in with Forgejo
    </button>
  );
}

export function SignOutButton() {
  return (
    <button
      onClick={() =>
        authClient.signOut({
          fetchOptions: { onSuccess: () => window.location.reload() },
        })
      }
      style={{
        padding: "6px 14px",
        background: "none",
        border: "1px solid #3a3a4a",
        borderRadius: 8,
        fontSize: 13,
        color: "#8888a0",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
    >
      Sign out
    </button>
  );
}
