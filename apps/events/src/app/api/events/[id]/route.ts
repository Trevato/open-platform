import { NextResponse } from "next/server";
import { headers } from "next/headers";
import pool from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const eventId = parseInt(id, 10);

  if (isNaN(eventId)) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  try {
    const eventResult = await pool.query(
      "SELECT * FROM events WHERE id = $1",
      [eventId],
    );

    if (eventResult.rows.length === 0) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const rsvpResult = await pool.query(
      `SELECT user_id, user_name, user_avatar, status, created_at
       FROM rsvps
       WHERE event_id = $1
       ORDER BY
         CASE status WHEN 'going' THEN 0 WHEN 'maybe' THEN 1 ELSE 2 END,
         created_at ASC`,
      [eventId],
    );

    const event = eventResult.rows[0];
    event.rsvps = rsvpResult.rows;
    event.going_count = rsvpResult.rows.filter(
      (r: { status: string }) => r.status === "going",
    ).length;
    event.maybe_count = rsvpResult.rows.filter(
      (r: { status: string }) => r.status === "maybe",
    ).length;
    event.not_going_count = rsvpResult.rows.filter(
      (r: { status: string }) => r.status === "not_going",
    ).length;

    return NextResponse.json(event);
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
    const eventResult = await pool.query(
      "SELECT organizer_id FROM events WHERE id = $1",
      [eventId],
    );

    if (eventResult.rows.length === 0) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (eventResult.rows[0].organizer_id !== session.user.id) {
      return NextResponse.json(
        { error: "Only the organizer can delete this event" },
        { status: 403 },
      );
    }

    await pool.query("DELETE FROM events WHERE id = $1", [eventId]);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
