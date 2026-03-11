import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { isPlatform } from "@/lib/mode";
import { listUsers, createUser } from "@/lib/forgejo";
import { randomBytes } from "crypto";

export async function GET() {
  if (!isPlatform) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await listUsers();
  return NextResponse.json({ users });
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
  const { username, email } = body;

  if (!username || !email) {
    return NextResponse.json(
      { error: "username and email are required" },
      { status: 400 }
    );
  }

  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{1,38}[a-zA-Z0-9]$/.test(username)) {
    return NextResponse.json(
      { error: "Invalid username" },
      { status: 400 }
    );
  }

  const password = randomBytes(16).toString("hex");

  const user = await createUser({
    username,
    email,
    password,
    mustChangePassword: true,
  });

  return NextResponse.json(
    { user, initialPassword: password },
    { status: 201 }
  );
}
