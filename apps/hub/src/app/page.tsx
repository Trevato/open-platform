import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "@/lib/db";
import { SignInButton, SignOutButton } from "@/app/components/sign-in-button";

export const dynamic = "force-dynamic";

interface Activity {
  id: number;
  type: string;
  app: string;
  actor_name: string | null;
  actor_avatar: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

const APP_ICONS: Record<string, string> = {
  social: "💬",
  arcade: "🎮",
  events: "📅",
  minecraft: "⛏️",
  hub: "🌐",
};

const TYPE_LABELS: Record<string, string> = {
  post_created: "shared a post",
  score_submitted: "submitted a score",
  event_created: "created an event",
  rsvp: "RSVP'd to an event",
  server_created: "created a server",
  server_started: "started a server",
  server_stopped: "stopped a server",
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  const [activitiesResult, statsResult] = await Promise.all([
    pool.query<Activity>("SELECT * FROM activities ORDER BY created_at DESC LIMIT 30"),
    pool.query("SELECT app, COUNT(*) as count FROM activities GROUP BY app ORDER BY count DESC"),
  ]);

  const activities = activitiesResult.rows;
  const appStats = statsResult.rows;
  const totalActivities = appStats.reduce((sum, row) => sum + parseInt(row.count), 0);

  return (
    <main style={{ minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header
        style={{
          borderBottom: "1px solid #1e1e28",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#0a0a0f",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", color: "#e0e0f0" }}>
          hub
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {session?.user ? (
            <>
              <span style={{ fontSize: 14, color: "#8888a0" }}>{session.user.name}</span>
              <SignOutButton />
            </>
          ) : (
            <SignInButton />
          )}
        </div>
      </header>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 32 }}>
          <div style={{ background: "#1a1a24", borderRadius: 14, padding: "18px 20px", border: "1px solid #2a2a3a" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e0e0f0" }}>{totalActivities}</div>
            <div style={{ fontSize: 13, color: "#4a4a6a", marginTop: 4 }}>Total Events</div>
          </div>
          {appStats.map((stat) => (
            <div key={stat.app} style={{ background: "#1a1a24", borderRadius: 14, padding: "18px 20px", border: "1px solid #2a2a3a" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#e0e0f0" }}>
                {APP_ICONS[stat.app] || "📦"} {stat.count}
              </div>
              <div style={{ fontSize: 13, color: "#4a4a6a", marginTop: 4 }}>{stat.app}</div>
            </div>
          ))}
        </div>

        {/* Activity Feed */}
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "#8888a0", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>
          Activity Feed
        </h2>
        {activities.length === 0 ? (
          <p style={{ textAlign: "center", color: "#4a4a6a", padding: "48px 0", fontSize: 15 }}>
            No activity yet. Use the platform apps to generate events.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activities.map((activity) => (
              <article
                key={activity.id}
                style={{
                  background: "#1a1a24",
                  border: "1px solid #2a2a3a",
                  borderRadius: 12,
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 20, flexShrink: 0 }}>{APP_ICONS[activity.app] || "📦"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: "#e0e0f0" }}>
                    <strong>{activity.actor_name || "Anonymous"}</strong>{" "}
                    <span style={{ color: "#8888a0" }}>{TYPE_LABELS[activity.type] || activity.type}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#4a4a6a", marginTop: 2 }}>
                    {activity.app} &middot; {timeAgo(activity.created_at)}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
