import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { headers } from "next/headers";
import pool from "@/lib/db";
import { s3Client, BUCKET } from "@/lib/s3";
import { auth } from "@/auth";

export async function GET() {
  try {
    const result = await pool.query(
      "SELECT * FROM posts ORDER BY created_at DESC",
    );
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
    const body = formData.get("body") as string | null;
    const image = formData.get("image") as File | null;

    if (!body?.trim()) {
      return NextResponse.json(
        { error: "Post body is required" },
        { status: 400 },
      );
    }

    let imageUrl: string | null = null;

    if (image && image.size > 0) {
      const timestamp = Date.now();
      const safeName = image.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filename = `uploads/${timestamp}-${safeName}`;

      const buffer = Buffer.from(await image.arrayBuffer());

      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: filename,
          Body: buffer,
          ContentType: image.type,
        }),
      );

      const publicUrl =
        process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || "http://minio.minio.svc:9000";
      imageUrl = `${publicUrl}/${BUCKET}/${filename}`;
    }

    const authorUsername = session.user.name || "anonymous";
    const authorAvatar = session.user.image || null;

    const result = await pool.query(
      `INSERT INTO posts (author_username, author_avatar, body, image_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [authorUsername, authorAvatar, body.trim(), imageUrl],
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
