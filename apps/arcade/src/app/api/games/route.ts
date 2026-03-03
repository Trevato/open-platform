import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const { rows } = await pool.query(
    "SELECT id, slug, name, description, icon, max_score, created_at FROM games ORDER BY name"
  );
  return NextResponse.json(rows);
}
