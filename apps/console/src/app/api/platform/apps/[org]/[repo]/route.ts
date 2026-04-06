import { NextRequest, NextResponse } from "next/server";
import { opApiDelete } from "@/lib/op-api";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ org: string; repo: string }> },
) {
  try {
    const { org, repo } = await params;
    const data = await opApiDelete(`/api/v1/platform/apps/${org}/${repo}`);
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
