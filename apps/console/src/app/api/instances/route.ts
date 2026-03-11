import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

const TIER_LIMITS: Record<string, number> = {
  free: 1,
  pro: 3,
  team: 10,
};

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customer = await pool.query(
    `SELECT * FROM customers WHERE user_id = $1`,
    [session.user.id]
  );

  if (customer.rows.length === 0) {
    return NextResponse.json({ instances: [] });
  }

  const instances = await pool.query(
    `SELECT i.*,
       (SELECT json_agg(e ORDER BY e.created_at DESC)
        FROM (
          SELECT phase, status, message, created_at
          FROM provision_events
          WHERE instance_id = i.id
          ORDER BY created_at DESC
          LIMIT 10
        ) e
       ) as recent_events
     FROM instances i
     WHERE i.customer_id = $1
     ORDER BY i.created_at DESC`,
    [customer.rows[0].id]
  );

  return NextResponse.json({ instances: instances.rows });
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.email) {
    return NextResponse.json(
      {
        error:
          "No email associated with your account. Please set a public email in your profile settings.",
      },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { slug, display_name, admin_email } = body;

  // Validate slug: lowercase alphanumeric + hyphens, 3-32 chars, starts with letter
  if (!slug || !/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) {
    return NextResponse.json(
      {
        error:
          "Slug must be 3-32 characters, lowercase letters, numbers, and hyphens. Must start with a letter.",
      },
      { status: 400 }
    );
  }

  const reserved = [
    "admin",
    "api",
    "www",
    "app",
    "console",
    "system",
    "ops",
    "staging",
    "prod",
  ];
  if (reserved.includes(slug)) {
    return NextResponse.json(
      { error: "This name is reserved" },
      { status: 400 }
    );
  }

  if (!display_name || display_name.length < 2 || display_name.length > 64) {
    return NextResponse.json(
      { error: "Display name must be 2-64 characters" },
      { status: 400 }
    );
  }

  if (!admin_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin_email)) {
    return NextResponse.json(
      { error: "Valid email required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure customer record exists (created on first instance)
    let customer = await client.query(
      `SELECT * FROM customers WHERE user_id = $1`,
      [session.user.id]
    );

    if (customer.rows.length === 0) {
      customer = await client.query(
        `INSERT INTO customers (user_id, email, name, github_username)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          session.user.id,
          session.user.email,
          session.user.name,
          session.user.name,
        ]
      );
    }

    const cust = customer.rows[0];

    // Enforce tier limits
    const count = await client.query(
      `SELECT COUNT(*) FROM instances
       WHERE customer_id = $1 AND status NOT IN ('terminated', 'failed')`,
      [cust.id]
    );

    const limit = TIER_LIMITS[cust.tier] || 1;
    if (parseInt(count.rows[0].count) >= limit) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: `Instance limit reached (${limit} for ${cust.tier} tier). Upgrade for more.`,
        },
        { status: 403 }
      );
    }

    // Check slug uniqueness
    const existing = await client.query(
      `SELECT id FROM instances WHERE slug = $1`,
      [slug]
    );

    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "This name is already taken" },
        { status: 409 }
      );
    }

    // Create instance
    const instance = await client.query(
      `INSERT INTO instances (customer_id, slug, display_name, tier, admin_email, admin_username)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [cust.id, slug, display_name, cust.tier, admin_email, "opadmin"]
    );

    // Log initial provision event
    await client.query(
      `INSERT INTO provision_events (instance_id, phase, status, message)
       VALUES ($1, 'queued', 'info', 'Instance queued for provisioning')`,
      [instance.rows[0].id]
    );

    await client.query("COMMIT");

    return NextResponse.json({ instance: instance.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
