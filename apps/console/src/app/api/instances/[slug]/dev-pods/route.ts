import { NextRequest, NextResponse } from "next/server";
import { opApiGet, opApiPost } from "@/lib/op-api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    const data = await opApiGet(
      `/api/v1/instances/${encodeURIComponent(slug)}/dev-pods`
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

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const data = await opApiPost(
      `/api/v1/instances/${encodeURIComponent(slug)}/dev-pods`,
      body
    );
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    if (e.message === "Not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const match = e.message?.match(/op-api (\d{3}):/);
    const status = match ? parseInt(match[1]) : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}
