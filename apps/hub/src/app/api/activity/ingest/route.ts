import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, app, actor_id, actor_name, actor_avatar, data, timestamp } = body;

    if (!type || !app) {
      return NextResponse.json({ error: "type and app are required" }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO activities (type, app, actor_id, actor_name, actor_avatar, data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [type, app, actor_id || null, actor_name || null, actor_avatar || null, JSON.stringify(data || {}), timestamp || new Date().toISOString()]
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to ingest activity" }, { status: 500 });
  }
}
