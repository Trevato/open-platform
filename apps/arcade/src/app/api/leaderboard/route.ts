import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
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

  return NextResponse.json(
    rows.map((r) => ({ ...r, rank: Number(r.rank) }))
  );
}
