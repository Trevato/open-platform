import { notFound } from "next/navigation";
import Link from "next/link";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ username: string }>;
}

interface PersonalBest {
  slug: string;
  name: string;
  icon: string;
  best_score: number;
  plays: number;
}

interface RecentScore {
  score: number;
  created_at: string;
  game_name: string;
  game_slug: string;
  game_icon: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PlayerPage({ params }: Props) {
  const { username } = await params;

  // Find user
  const userResult = await pool.query(
    `SELECT id, name, image, "createdAt" FROM "user" WHERE name = $1`,
    [username]
  );

  if (userResult.rows.length === 0) {
    notFound();
  }

  const user = userResult.rows[0];

  // Get personal bests per game
  const bestsResult = await pool.query(
    `SELECT g.slug, g.name, g.icon, MAX(s.score) AS best_score, COUNT(s.id) AS plays
     FROM scores s
     JOIN games g ON g.id = s.game_id
     WHERE s.player_id = $1
     GROUP BY g.slug, g.name, g.icon
     ORDER BY best_score DESC`,
    [user.id]
  );

  // Get recent scores
  const scoresResult = await pool.query(
    `SELECT s.score, s.created_at, g.name AS game_name, g.slug AS game_slug, g.icon AS game_icon
     FROM scores s
     JOIN games g ON g.id = s.game_id
     WHERE s.player_id = $1
     ORDER BY s.created_at DESC
     LIMIT 20`,
    [user.id]
  );

  // Stats
  const totalGames = bestsResult.rows.length;
  const totalPlays = scoresResult.rows.length;
  const totalScore = bestsResult.rows.reduce(
    (sum: number, r: { best_score: string }) => sum + Number(r.best_score),
    0
  );

  // Get highest rank
  let highestRank: number | null = null;
  if (totalGames > 0) {
    const rankResult = await pool.query(
      `SELECT MIN(r.rank) AS highest_rank
       FROM (
         SELECT s.player_id,
           RANK() OVER (PARTITION BY s.game_id ORDER BY MAX(s.score) DESC) AS rank
         FROM scores s
         GROUP BY s.game_id, s.player_id
       ) r
       WHERE r.player_id = $1`,
      [user.id]
    );
    highestRank = rankResult.rows[0]?.highest_rank
      ? Number(rankResult.rows[0].highest_rank)
      : null;
  }

  const personalBests: PersonalBest[] = bestsResult.rows.map((r: { slug: string; name: string; icon: string; best_score: string; plays: string }) => ({
    slug: r.slug,
    name: r.name,
    icon: r.icon,
    best_score: Number(r.best_score),
    plays: Number(r.plays),
  }));

  const recentScores: RecentScore[] = scoresResult.rows;

  const statItems = [
    { label: "Games Played", value: totalGames },
    { label: "Total Plays", value: totalPlays },
    { label: "Total Score", value: totalScore.toLocaleString() },
    { label: "Highest Rank", value: highestRank ? `#${highestRank}` : "-" },
  ];

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      {/* Player Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {user.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            width={56}
            height={56}
            style={{ borderRadius: "50%", border: "2px solid #2a2a3a" }}
          />
        )}
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            {user.name}
          </h1>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: 13 }}>
            Joined {formatDate(user.createdAt)}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 32,
        }}
      >
        {statItems.map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "#1a1a24",
              borderRadius: 12,
              padding: 20,
              border: "1px solid #2a2a3a",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "#666",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 8,
              }}
            >
              {stat.label}
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#e2e2e8",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Personal Bests */}
      {personalBests.length > 0 && (
        <section style={{ marginBottom: 32 }}>
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
            Personal Bests
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {personalBests.map((pb) => (
              <Link
                key={pb.slug}
                href={`/games/${pb.slug}`}
                style={{
                  textDecoration: "none",
                  background: "#1a1a24",
                  borderRadius: 12,
                  padding: 16,
                  border: "1px solid #2a2a3a",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{pb.icon}</span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#e2e2e8",
                    }}
                  >
                    {pb.name}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: "#a855f7",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {pb.best_score.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 12, color: "#666" }}>
                    {pb.plays} plays
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent Activity */}
      <section>
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
          Recent Activity
        </h2>
        {recentScores.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "48px 0",
              color: "#555",
              fontSize: 14,
            }}
          >
            No scores yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentScores.map((score, i) => (
              <Link
                key={`${score.game_slug}-${score.created_at}-${i}`}
                href={`/games/${score.game_slug}`}
                style={{
                  textDecoration: "none",
                  background: "#1a1a24",
                  borderRadius: 10,
                  padding: "12px 16px",
                  border: "1px solid #2a2a3a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{score.game_icon}</span>
                  <span style={{ fontSize: 14, color: "#e2e2e8" }}>
                    {score.game_name}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#e2e2e8",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {score.score.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 12, color: "#666" }}>
                    {formatDate(score.created_at)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
