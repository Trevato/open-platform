"use client";

import { authClient } from "@/lib/auth-client";

export function LandingCTA({
  size = "default",
  variant = "accent",
}: {
  size?: "default" | "lg";
  variant?: "accent" | "ghost";
}) {
  const sizeClass = size === "lg" ? "btn-lg" : "";
  const variantClass = variant === "ghost" ? "btn-ghost" : "btn-accent";

  return (
    <button
      className={`btn ${variantClass} ${sizeClass}`}
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
