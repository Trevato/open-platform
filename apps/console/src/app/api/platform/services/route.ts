import { NextResponse } from "next/server";
import { getSessionWithRole } from "@/lib/session-role";
import { getServiceStatuses } from "@/lib/k8s";

export async function GET() {
  const result = await getSessionWithRole();
  if (!result) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (result.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const services = await getServiceStatuses();
  return NextResponse.json({ services });
}
