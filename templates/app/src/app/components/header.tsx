import { auth } from "@/auth";
import { headers } from "next/headers";
import { SignInButton, SignOutButton } from "./sign-in-button";

function getAppName() {
  try {
    return new URL(process.env.BETTER_AUTH_URL || "").hostname.split(".")[0];
  } catch {
    return "app";
  }
}

export async function Header() {
  const session = await auth.api.getSession({ headers: await headers() });
  const appName = getAppName();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-sidebar)",
      }}
    >
      <a
        href="/"
        style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}
      >
        {appName}
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {session ? (
          <>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {session.user.name}
            </span>
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                style={{ width: 28, height: 28, borderRadius: "50%" }}
              />
            )}
            <SignOutButton />
          </>
        ) : (
          <SignInButton />
        )}
      </div>
    </header>
  );
}
