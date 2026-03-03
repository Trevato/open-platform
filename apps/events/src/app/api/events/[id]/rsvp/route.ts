import { NextResponse } from "next/server";
import { headers } from "next/headers";
import pool from "@/lib/db";
import { auth } from "@/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const eventId = parseInt(id, 10);

  if (isNaN(eventId)) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { status } = body;

    if (!["going", "maybe", "not_going"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be going, maybe, or not_going" },
        { status: 400 },
      );
    }

    // Verify event exists
    const eventResult = await pool.query(
      "SELECT id, max_attendees FROM events WHERE id = $1",
      [eventId],
    );

    if (eventResult.rows.length === 0) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check capacity if setting status to "going"
    const event = eventResult.rows[0];
    if (status === "going" && event.max_attendees) {
      const countResult = await pool.query(
        `SELECT COUNT(*) AS going_count FROM rsvps
         WHERE event_id = $1 AND status = 'going' AND user_id != $2`,
        [eventId, session.user.id],
      );
      if (parseInt(countResult.rows[0].going_count, 10) >= event.max_attendees) {
        return NextResponse.json(
          { error: "Event is at capacity" },
          { status: 409 },
        );
      }
    }

    const result = await pool.query(
      `INSERT INTO rsvps (event_id, user_id, user_name, user_avatar, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id, user_id)
       DO UPDATE SET status = $5, user_name = $3, user_avatar = $4, updated_at = NOW()
       RETURNING *`,
      [
        eventId,
        session.user.id,
        session.user.name || "anonymous",
        session.user.image || null,
        status,
      ],
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const eventId = parseInt(id, 10);

  if (isNaN(eventId)) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  try {
    await pool.query(
      "DELETE FROM rsvps WHERE event_id = $1 AND user_id = $2",
      [eventId, session.user.id],
    );

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
