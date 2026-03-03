import { auth } from "@/auth";
import { headers } from "next/headers";
import { SignInButton, SignOutButton } from "./sign-in-button";
import Link from "next/link";

export async function Header() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px",
        borderBottom: "1px solid #1e1e2e",
        background: "#0f0f13",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Link
          href="/"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 24 }}>🕹️</span>
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#e2e2e8",
              letterSpacing: "-0.02em",
            }}
          >
            Arcade
          </span>
        </Link>
        <nav style={{ display: "flex", gap: 16 }}>
          <Link
            href="/"
            style={{
              color: "#888",
              textDecoration: "none",
              fontSize: 14,
              transition: "color 0.15s",
            }}
          >
            Games
          </Link>
        </nav>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {session?.user ? (
          <>
            <Link
              href={`/players/${session.user.name}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
                color: "#ccc",
                fontSize: 14,
              }}
            >
              {session.user.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt=""
                  width={28}
                  height={28}
                  style={{ borderRadius: "50%" }}
                />
              )}
              <span>{session.user.name}</span>
            </Link>
            <SignOutButton />
          </>
        ) : (
          <SignInButton />
        )}
      </div>
    </header>
  );
}
