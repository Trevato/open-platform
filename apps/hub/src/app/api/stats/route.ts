import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [totalResult, appBreakdown, recentResult, topUsersResult] = await Promise.all([
    pool.query("SELECT COUNT(*) as total FROM activities"),
    pool.query("SELECT app, COUNT(*) as count FROM activities GROUP BY app ORDER BY count DESC"),
    pool.query("SELECT COUNT(*) as count FROM activities WHERE created_at > NOW() - INTERVAL '24 hours'"),
    pool.query(`
      SELECT actor_name, actor_avatar, COUNT(*) as activity_count
      FROM activities
      WHERE actor_name IS NOT NULL
      GROUP BY actor_name, actor_avatar
      ORDER BY activity_count DESC
      LIMIT 5
    `),
  ]);

  return NextResponse.json({
    total_activities: parseInt(totalResult.rows[0]?.total || "0"),
    last_24h: parseInt(recentResult.rows[0]?.count || "0"),
    by_app: appBreakdown.rows,
    top_users: topUsersResult.rows,
  });
}
