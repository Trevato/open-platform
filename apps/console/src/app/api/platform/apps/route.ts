import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { isPlatform } from "@/lib/mode";
import { getApps } from "@/lib/k8s";
import { generateFromTemplate, listOrgs } from "@/lib/forgejo";

export async function GET() {
  if (!isPlatform) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [apps, orgs] = await Promise.all([getApps(), listOrgs()]);
  return NextResponse.json({ apps, orgs });
}

export async function POST(request: NextRequest) {
  if (!isPlatform) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
