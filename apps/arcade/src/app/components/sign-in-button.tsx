"use client";

import { authClient } from "@/lib/auth-client";

export function SignInButton() {
  return (
    <button
      onClick={() =>
        authClient.signIn.oauth2({ providerId: "forgejo", callbackURL: "/" })
      }
      style={{
        padding: "8px 20px",
        background: "linear-gradient(135deg, #6c5ce7, #a855f7)",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        transition: "opacity 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      Sign in
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
        padding: "8px 16px",
        background: "none",
        border: "1px solid #333",
        borderRadius: 8,
        fontSize: 13,
        color: "#888",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#555")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#333")}
    >
      Sign out
    </button>
  );
}
