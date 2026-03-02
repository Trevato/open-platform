import { S3Client } from "@aws-sdk/client-s3";

export const BUCKET = process.env.S3_BUCKET || "PROJECT_NAME";

export const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || "http://minio.minio.svc:9000",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
  },
  forcePathStyle: true,
});
