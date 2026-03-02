import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { headers } from "next/headers";
import { s3Client, BUCKET } from "@/lib/s3";
import { auth } from "@/auth";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `uploads/${timestamp}-${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: filename,
        Body: buffer,
        ContentType: file.type,
      }),
    );

    const publicUrl = process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || "http://minio.minio.svc:9000";
    const url = `${publicUrl}/${BUCKET}/${filename}`;

    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
