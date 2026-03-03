import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "@/lib/db";
import { LeaderboardTable } from "@/app/components/leaderboard-table";
import { Podium } from "@/app/components/podium";
import { PeriodFilter } from "@/app/components/period-filter";
import { GameLoader } from "@/app/components/games/game-loader";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ period?: string }>;
}

export default async function GamePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { period } = await searchParams;

  const gameResult = await pool.query(
    "SELECT id, slug, name, description, icon, max_score FROM games WHERE slug = $1",
    [slug]
  );

  if (gameResult.rows.length === 0) {
    notFound();
  }

  const game = gameResult.rows[0];

  let dateFilter = "";
  if (period === "today") {
    dateFilter = "AND s.created_at > NOW() - INTERVAL '1 day'";
  } else if (period === "week") {
    dateFilter = "AND s.created_at > NOW() - INTERVAL '7 days'";
  }

  const scoresResult = await pool.query(
    `SELECT
      RANK() OVER (ORDER BY s.score DESC) AS rank,
      s.player_name,
      s.player_id,
      s.score,
      s.created_at
    FROM scores s
    WHERE s.game_id = $1 ${dateFilter}
    ORDER BY s.score DESC
    LIMIT 50`,
    [game.id]
  );

  const scores = scoresResult.rows.map((r: { rank: string | number; player_name: string; player_id: string; score: number; created_at: string }) => ({
    ...r,
    rank: Number(r.rank),
  }));

  const top3 = scores.slice(0, 3);

  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      {/* Game Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 36 }}>{game.icon}</span>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>
            {game.name}
          </h1>
        </div>
        <p style={{ margin: 0, color: "#888", fontSize: 15 }}>
          {game.description}
        </p>
      </div>

      {/* Play */}
      <div style={{ marginBottom: 32 }}>
        <GameLoader slug={slug} isLoggedIn={!!session?.user} />
      </div>

      {/* Podium */}
      {top3.length >= 3 && !period && <Podium entries={top3} />}

      {/* Leaderboard */}
      <section>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "#888",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Leaderboard
          </h2>
          <PeriodFilter />
        </div>
        <LeaderboardTable scores={scores} />
      </section>
    </main>
  );
}
