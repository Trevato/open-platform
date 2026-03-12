import { NextRequest, NextResponse } from "next/server";
import { getInstanceAccess } from "@/lib/instance-access";
import { getInstanceServiceStatuses } from "@/lib/k8s";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const access = await getInstanceAccess(slug);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (access.instance.status !== "ready") return NextResponse.json({ services: [] });
  const services = await getInstanceServiceStatuses(slug);
  return NextResponse.json({ services });
}
