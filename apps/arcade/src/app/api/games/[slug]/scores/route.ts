import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");

  // Validate game exists
  const gameResult = await pool.query(
    "SELECT id FROM games WHERE slug = $1",
    [slug]
  );
  if (gameResult.rows.length === 0) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  const gameId = gameResult.rows[0].id;

  let dateFilter = "";
  const queryParams: (number | string)[] = [gameId];

  if (period === "today") {
    dateFilter = "AND s.created_at > NOW() - INTERVAL '1 day'";
  } else if (period === "week") {
    dateFilter = "AND s.created_at > NOW() - INTERVAL '7 days'";
  }

  const { rows } = await pool.query(
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
    queryParams
  );

  return NextResponse.json(
    rows.map((r) => ({ ...r, rank: Number(r.rank) }))
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json(
      { error: "Sign in to submit scores" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const score = parseInt(body.score, 10);

  if (isNaN(score) || score < 0) {
    return NextResponse.json(
      { error: "Score must be a positive number" },
      { status: 400 }
    );
  }

  // Validate game exists and check max_score
  const gameResult = await pool.query(
    "SELECT id, max_score FROM games WHERE slug = $1",
    [slug]
  );
  if (gameResult.rows.length === 0) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  const game = gameResult.rows[0];

  if (game.max_score && score > game.max_score) {
    return NextResponse.json(
      { error: `Score cannot exceed ${game.max_score}` },
      { status: 400 }
    );
  }

  // Insert score
  await pool.query(
    "INSERT INTO scores (game_id, player_id, player_name, score) VALUES ($1, $2, $3, $4)",
    [game.id, session.user.id, session.user.name, score]
  );

  // Get personal best
  const bestResult = await pool.query(
    "SELECT MAX(score) AS best FROM scores WHERE game_id = $1 AND player_id = $2",
    [game.id, session.user.id]
  );
  const personalBest = bestResult.rows[0].best;

  // Get current rank
  const rankResult = await pool.query(
    `SELECT COUNT(*) + 1 AS rank
     FROM (
       SELECT player_id, MAX(score) AS best_score
       FROM scores
       WHERE game_id = $1
       GROUP BY player_id
     ) ranked
     WHERE ranked.best_score > $2`,
    [game.id, personalBest]
  );
  const rank = Number(rankResult.rows[0].rank);

  return NextResponse.json({ personalBest, rank });
}
