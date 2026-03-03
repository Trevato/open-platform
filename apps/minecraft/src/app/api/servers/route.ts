import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/auth";
import pool from "@/lib/db";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pool.query(
    "SELECT * FROM servers WHERE owner_id = $1 ORDER BY created_at DESC",
    [session.user.id],
  );

  return NextResponse.json(result.rows);
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, game_mode, difficulty, max_players, version, motd, icon_url } =
    body;

  if (!name || !name.trim()) {
    return NextResponse.json(
      { error: "Server name is required" },
      { status: 400 },
    );
  }

  const countResult = await pool.query(
    "SELECT COUNT(*) FROM servers WHERE owner_id = $1",
    [session.user.id],
  );
  if (parseInt(countResult.rows[0].count, 10) >= 5) {
    return NextResponse.json(
      { error: "Maximum of 5 servers per user" },
      { status: 400 },
    );
  }

  const result = await pool.query(
    `INSERT INTO servers (owner_id, name, game_mode, difficulty, max_players, version, motd, icon_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      session.user.id,
      name.trim(),
      game_mode || "survival",
      difficulty || "normal",
      max_players || 10,
      version || "1.21",
      motd || "A Minecraft Server",
      icon_url || null,
    ],
  );

  return NextResponse.json(result.rows[0], { status: 201 });
}
