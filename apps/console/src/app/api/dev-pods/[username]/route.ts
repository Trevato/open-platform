import { NextRequest, NextResponse } from "next/server";
import { opApiGet, opApiPatch, opApiDelete } from "@/lib/op-api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ username: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { username } = await params;
    const data = await opApiGet(
      `/api/v1/dev-pods/${encodeURIComponent(username)}`,
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

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { username } = await params;
    const body = await request.json();
    const data = await opApiPatch(
      `/api/v1/dev-pods/${encodeURIComponent(username)}`,
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

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { username } = await params;
    const data = await opApiDelete(
      `/api/v1/dev-pods/${encodeURIComponent(username)}`,
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
