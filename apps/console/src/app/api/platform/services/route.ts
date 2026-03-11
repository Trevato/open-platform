import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { isPlatform } from "@/lib/mode";
import { getServiceStatuses } from "@/lib/k8s";

export async function GET() {
  if (!isPlatform) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const services = await getServiceStatuses();
  return NextResponse.json({ services });
}
