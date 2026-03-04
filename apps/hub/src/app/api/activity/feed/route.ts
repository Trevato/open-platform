import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");
  const app = searchParams.get("app");

  let query = "SELECT * FROM activities";
  const params: (string | number)[] = [];

  if (app) {
    params.push(app);
    query += ` WHERE app = $${params.length}`;
  }

  query += " ORDER BY created_at DESC";
  params.push(limit);
  query += ` LIMIT $${params.length}`;
  params.push(offset);
  query += ` OFFSET $${params.length}`;

  const { rows } = await pool.query(query, params);

  return NextResponse.json(rows);
}
