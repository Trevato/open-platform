import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { headers } from "next/headers";
import pool from "@/lib/db";
import { s3Client, BUCKET } from "@/lib/s3";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        e.*,
        COALESCE(r.going_count, 0)::int AS going_count,
        COALESCE(r.maybe_count, 0)::int AS maybe_count
      FROM events e
      LEFT JOIN (
        SELECT
          event_id,
          COUNT(*) FILTER (WHERE status = 'going') AS going_count,
          COUNT(*) FILTER (WHERE status = 'maybe') AS maybe_count
        FROM rsvps
        GROUP BY event_id
      ) r ON r.event_id = e.id
      ORDER BY
        CASE WHEN e.event_date >= CURRENT_DATE THEN 0 ELSE 1 END,
        CASE WHEN e.event_date >= CURRENT_DATE THEN e.event_date END ASC,
        CASE WHEN e.event_date < CURRENT_DATE THEN e.event_date END DESC
    `);
    return NextResponse.json(result.rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const title = formData.get("title") as string | null;
    const description = formData.get("description") as string | null;
    const eventDate = formData.get("event_date") as string | null;
    const eventTime = formData.get("event_time") as string | null;
    const location = formData.get("location") as string | null;
    const maxAttendees = formData.get("max_attendees") as string | null;
    const coverImage = formData.get("cover_image") as File | null;

    if (!title?.trim()) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 },
      );
    }
    if (!eventDate) {
      return NextResponse.json(
        { error: "Event date is required" },
        { status: 400 },
      );
    }

    let coverImageUrl: string | null = null;

    if (coverImage && coverImage.size > 0) {
      const timestamp = Date.now();
      const safeName = coverImage.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filename = `covers/${timestamp}-${safeName}`;
      const buffer = Buffer.from(await coverImage.arrayBuffer());

      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: filename,
          Body: buffer,
          ContentType: coverImage.type,
        }),
      );

      const publicUrl =
        process.env.S3_PUBLIC_URL ||
        process.env.S3_ENDPOINT ||
        "http://minio.minio.svc:9000";
      coverImageUrl = `${publicUrl}/${BUCKET}/${filename}`;
    }

    const maxAttendeesValue =
      maxAttendees && parseInt(maxAttendees, 10) > 0
        ? parseInt(maxAttendees, 10)
        : null;

    const result = await pool.query(
      `INSERT INTO events (title, description, event_date, event_time, location, cover_image_url, max_attendees, organizer_id, organizer_name, organizer_avatar)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        title.trim(),
        description?.trim() || null,
        eventDate,
        eventTime || null,
        location?.trim() || null,
        coverImageUrl,
        maxAttendeesValue,
        session.user.id,
        session.user.name || "anonymous",
        session.user.image || null,
      ],
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
