import { NextRequest, NextResponse } from "next/server";
import { getInstanceAccess } from "@/lib/instance-access";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const access = await getInstanceAccess(slug);

  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { instance } = access;

  if (instance.status !== "ready") {
    return NextResponse.json(
      { error: "Instance must be ready to download kubeconfig" },
      { status: 400 }
    );
  }

  if (!instance.kubeconfig) {
    return NextResponse.json(
      { error: "Kubeconfig not yet available" },
      { status: 404 }
    );
  }

  return NextResponse.json({ kubeconfig: instance.kubeconfig });
}
