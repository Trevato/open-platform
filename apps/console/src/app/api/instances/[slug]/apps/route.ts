import { NextRequest, NextResponse } from "next/server";
import { opApiGet } from "@/lib/op-api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const data = await opApiGet(
      `/api/v1/instances/${encodeURIComponent(slug)}/apps`
    );
    return NextResponse.json(data);
  } catch (e: any) {
    if (e.message === "Not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const match = e.message?.match(/op-api (\d{3}):/);
    const status = match ? parseInt(match[1]) : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}
