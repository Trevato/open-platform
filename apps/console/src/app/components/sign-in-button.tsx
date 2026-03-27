"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { UserConnectionModal } from "./user-connection-modal";

export function SignInButton({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "lg";
}) {
  const sizeClass = size === "lg" ? "btn-lg" : "";

  return (
    <button
      className={`btn btn-accent ${sizeClass} ${className || ""}`}
      onClick={() =>
        authClient.signIn.oauth2({
          providerId: "forgejo",
          callbackURL: "/dashboard",
        })
      }
    >
      Get Started
    </button>
  );
}

export function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      className={`btn btn-ghost btn-sm ${className || ""}`}
      onClick={() =>
        authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              window.location.href = "/";
            },
          },
        })
      }
    >
      Sign out
    </button>
  );
}

export function UserMenu() {
  const { data: session, isPending } = authClient.useSession();
  const [showConnect, setShowConnect] = useState(false);

  if (isPending) {
    return <div className="spinner spinner-sm" />;
  }

  if (!session?.user) {
    return <SignInButton className="" size="default" />;
  }

  const initial = (session.user.name || session.user.email || "?")
    .charAt(0)
    .toUpperCase();

  return (
    <div className="nav-actions">
      <div className="nav-user">
        {session.user.image ? (
          <img src={session.user.image} alt="" className="nav-avatar" />
        ) : (
          <span className="nav-avatar-placeholder">{initial}</span>
        )}
        <span className="nav-username">{session.user.name}</span>
      </div>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setShowConnect(true)}
        style={{ fontSize: 12 }}
      >
        Claude Code
      </button>
      <SignOutButton />
      {showConnect && (
        <UserConnectionModal onClose={() => setShowConnect(false)} />
      )}
    </div>
  );
}
