import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "@/lib/db";
import { SignInButton, SignOutButton } from "@/app/components/sign-in-button";
import { ServerCard } from "@/app/components/server-card";
import { CreateServerForm } from "@/app/components/create-server-form";
import type { Server } from "@/app/components/server-card";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });

  let servers: Server[] = [];
  if (session) {
    const result = await pool.query(
      "SELECT * FROM servers WHERE owner_id = $1 ORDER BY created_at DESC",
      [session.user.id],
    );
    servers = result.rows;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f13" }}>
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "#1a1a24",
          borderBottom: "1px solid #2a2a3a",
          padding: "0 16px",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "#e8e8f0",
            }}
          >
            minecraft
          </span>

          {session ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              {session.user.image && (
                <img
                  src={session.user.image}
                  alt=""
                  width={28}
                  height={28}
                  style={{
                    borderRadius: "50%",
                    border: "1px solid #2a2a3a",
                  }}
                />
              )}
              <span
                style={{
                  fontSize: 13,
                  color: "#8888a0",
                }}
              >
                {session.user.name}
              </span>
              <SignOutButton />
            </div>
          ) : (
            <SignInButton />
          )}
        </div>
      </header>

      {/* Content */}
      <main
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "24px 16px",
        }}
      >
        {session ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <CreateServerForm />
            </div>

            {servers.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "48px 0",
                  color: "#8888a0",
                  fontSize: 14,
                }}
              >
                No servers yet. Create one to get started.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                {servers.map((server) => (
                  <ServerCard key={server.id} server={server} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "80px 0",
              color: "#8888a0",
              fontSize: 14,
            }}
          >
            Sign in to create and manage Minecraft servers.
          </div>
        )}
      </main>
    </div>
  );
}
