import Link from "next/link";
import pool from "@/lib/db";
import { LeaderboardTable } from "@/app/components/leaderboard-table";

export const dynamic = "force-dynamic";

interface Game {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
}

interface ScoreRow {
  rank: string | number;
  player_name: string;
  player_id: string;
  score: number;
  created_at: string;
  game_name: string;
  game_slug: string;
  game_icon: string;
}

async function getGames(): Promise<Game[]> {
  const { rows } = await pool.query(
    "SELECT id, slug, name, description, icon FROM games ORDER BY name"
  );
  return rows;
}

async function getHallOfFame(): Promise<ScoreRow[]> {
  const { rows } = await pool.query(
    `SELECT
      RANK() OVER (ORDER BY s.score DESC) AS rank,
      s.player_name,
      s.player_id,
      s.score,
      s.created_at,
      g.name AS game_name,
      g.slug AS game_slug,
      g.icon AS game_icon
    FROM scores s
    JOIN games g ON g.id = s.game_id
    ORDER BY s.score DESC
    LIMIT 10`
  );
  return rows.map((r: ScoreRow) => ({ ...r, rank: Number(r.rank) }));
}

async function getRecentScores(): Promise<ScoreRow[]> {
  const { rows } = await pool.query(
    `SELECT
      RANK() OVER (ORDER BY s.created_at DESC) AS rank,
      s.player_name,
      s.player_id,
      s.score,
      s.created_at,
      g.name AS game_name,
      g.slug AS game_slug,
      g.icon AS game_icon
    FROM scores s
    JOIN games g ON g.id = s.game_id
    ORDER BY s.created_at DESC
    LIMIT 20`
  );
  return rows.map((r: ScoreRow, i: number) => ({ ...r, rank: i + 1 }));
}

export default async function Home() {
  const [games, hallOfFame, recentScores] = await Promise.all([
    getGames(),
    getHallOfFame(),
    getRecentScores(),
  ]);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      {/* Games Grid */}
      <section style={{ marginBottom: 48 }}>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 16,
          }}
        >
          Games
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {games.map((game) => (
            <Link
              key={game.slug}
              href={`/games/${game.slug}`}
              style={{
                textDecoration: "none",
                background: "#1a1a24",
                borderRadius: 12,
                padding: 20,
                border: "1px solid #2a2a3a",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                transition: "border-color 0.15s, transform 0.1s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 28 }}>{game.icon}</span>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#e2e2e8",
                  }}
                >
                  {game.name}
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "#888",
                  lineHeight: 1.5,
                }}
              >
                {game.description}
              </p>
              <span
                style={{
                  fontSize: 12,
                  color: "#6c5ce7",
                  fontWeight: 500,
                  marginTop: 4,
                }}
              >
                View Leaderboard
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Hall of Fame */}
      <section style={{ marginBottom: 48 }}>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>🏆</span>
          Hall of Fame
        </h2>
        <LeaderboardTable scores={hallOfFame} showGame />
      </section>

      {/* Recent Scores */}
      <section>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>⚡</span>
          Recent Scores
        </h2>
        <LeaderboardTable scores={recentScores} showGame />
      </section>
    </main>
  );
}
