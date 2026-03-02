import { NextResponse } from "next/server";
import {
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { s3Client, BUCKET } from "@/lib/s3";

export async function GET() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));

    const testKey = `test/${Date.now()}.txt`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: testKey,
        Body: "ok",
      }),
    );

    return NextResponse.json({ status: "ok", bucket: BUCKET, testKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}
