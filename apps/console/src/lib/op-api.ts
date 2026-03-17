import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "./db";

const OP_API_URL =
  process.env.OP_API_URL || "http://op-api.op-system-op-api.svc:80";

async function getForgejoToken(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const result = await pool.query(
    `SELECT "accessToken" FROM account WHERE "userId" = $1 AND "providerId" = 'forgejo' ORDER BY "createdAt" DESC LIMIT 1`,
    [session.user.id]
  );
  return result.rows[0]?.accessToken || null;
}

export async function opApiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getForgejoToken();
  if (!token) throw new Error("Not authenticated");

  return fetch(`${OP_API_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export async function opApiGet(path: string) {
  const res = await opApiFetch(path);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`op-api ${res.status}: ${body}`);
  }
  return res.json();
}

export async function opApiPost(path: string, body?: unknown) {
  const res = await opApiFetch(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`op-api ${res.status}: ${errBody}`);
  }
  return res.json();
}

export async function opApiPatch(path: string, body?: unknown) {
  const res = await opApiFetch(path, {
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`op-api ${res.status}: ${errBody}`);
  }
  return res.json();
}

export async function opApiDelete(path: string) {
  const res = await opApiFetch(path, { method: "DELETE" });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`op-api ${res.status}: ${errBody}`);
  }
  return res.json();
}

export { getForgejoToken };
