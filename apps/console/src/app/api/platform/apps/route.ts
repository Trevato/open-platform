import { NextRequest, NextResponse } from "next/server";
import { getSessionWithRole } from "@/lib/session-role";
import { getApps } from "@/lib/k8s";
import { generateFromTemplate, listOrgs } from "@/lib/forgejo";

export async function GET() {
  const result = await getSessionWithRole();
  if (!result) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (result.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [apps, orgs] = await Promise.all([getApps(), listOrgs()]);
  return NextResponse.json({ apps, orgs });
}

export async function POST(request: NextRequest) {
  const result = await getSessionWithRole();
  if (!result) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (result.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { org, name, description } = body;

  if (!org || !name) {
    return NextResponse.json(
      { error: "org and name are required" },
      { status: 400 }
    );
  }

  if (!/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(name)) {
    return NextResponse.json(
      { error: "Name must be lowercase, start with a letter, 3-32 chars" },
      { status: 400 }
    );
  }

  const repo = await generateFromTemplate("system", "template", {
    owner: org,
    name,
    description,
  });

  return NextResponse.json({ repo }, { status: 201 });
}
