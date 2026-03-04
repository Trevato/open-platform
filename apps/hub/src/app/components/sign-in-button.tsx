"use client";

import { authClient } from "@/lib/auth-client";

export function SignInButton() {
  return (
    <button
      onClick={() =>
        authClient.signIn.oauth2({ providerId: "forgejo", callbackURL: "/" })
      }
      style={{
        padding: "6px 14px",
        background: "#6c5ce7",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      Sign in
    </button>
  );
}

export function SignOutButton() {
  return (
    <button
      onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => window.location.reload() } })}
      style={{
        padding: "6px 14px",
        background: "none",
        border: "1px solid #2a2a3a",
        borderRadius: 6,
        fontSize: 13,
        color: "#8888a0",
        cursor: "pointer",
      }}
    >
      Sign out
    </button>
  );
}
