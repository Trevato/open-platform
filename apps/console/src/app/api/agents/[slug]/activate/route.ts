import { NextRequest, NextResponse } from "next/server";
import { opApiPost } from "@/lib/op-api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { slug } = await params;
    const body = await request.json().catch(() => ({}));
    const data = await opApiPost(
      `/api/v1/agents/${encodeURIComponent(slug)}/activate`,
      body,
    );
    return NextResponse.json(data);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message === "Not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const match = message.match(/op-api (\d{3}):/);
    const status = match ? parseInt(match[1]) : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
