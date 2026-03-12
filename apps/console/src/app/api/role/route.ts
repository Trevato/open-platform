import { NextResponse } from "next/server";
import { getSessionWithRole } from "@/lib/session-role";

export async function GET() {
  const result = await getSessionWithRole();
  if (!result) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ role: result.role });
}
