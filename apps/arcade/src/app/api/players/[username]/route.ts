import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  // Find the user
  const userResult = await pool.query(
    `SELECT id, name, email, image, "createdAt" FROM "user" WHERE name = $1`,
    [username]
  );

  if (userResult.rows.length === 0) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const user = userResult.rows[0];

  // Get all scores with game info
  const scoresResult = await pool.query(
    `SELECT s.score, s.created_at, g.name AS game_name, g.slug AS game_slug, g.icon AS game_icon
     FROM scores s
     JOIN games g ON g.id = s.game_id
     WHERE s.player_id = $1
     ORDER BY s.created_at DESC`,
    [user.id]
  );

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

  // Get stats
  const totalGames = bestsResult.rows.length;
  const totalPlays = scoresResult.rows.length;
  const totalScore = scoresResult.rows.reduce(
    (sum: number, r: { score: number }) => sum + r.score,
    0
  );

  // Get highest rank across all games
  let highestRank = null;
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

  return NextResponse.json({
    player: {
      name: user.name,
      image: user.image,
      joinedAt: user.createdAt,
    },
    stats: {
      totalGames,
      totalPlays,
      totalScore,
      highestRank,
    },
    personalBests: bestsResult.rows.map((r) => ({
      ...r,
      best_score: Number(r.best_score),
      plays: Number(r.plays),
    })),
    recentScores: scoresResult.rows.slice(0, 20),
  });
}
