import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "./db";

const OP_API_URL =
  process.env.OP_API_URL || "http://op-api.op-system-op-api.svc:80";

const FORGEJO_INTERNAL_URL =
  process.env.AUTH_FORGEJO_INTERNAL_URL ||
  process.env.AUTH_FORGEJO_URL ||
  process.env.FORGEJO_INTERNAL_URL ||
  process.env.FORGEJO_URL ||
  "https://forgejo.dev.test";

const TOKEN_VALIDATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Maps truncated token (first 16 chars) to last successful validation timestamp */
const tokenValidationCache = new Map<string, number>();

async function validateForgejoToken(token: string): Promise<boolean> {
  const cacheKey = token.slice(0, 16);
  const lastValidated = tokenValidationCache.get(cacheKey);

  if (lastValidated && Date.now() - lastValidated < TOKEN_VALIDATION_TTL_MS) {
    return true;
  }

  try {
    const res = await fetch(`${FORGEJO_INTERNAL_URL}/api/v1/user`, {
      headers: { Authorization: `token ${token}` },
    });

    if (res.ok) {
      tokenValidationCache.set(cacheKey, Date.now());
      return true;
    }

    // Token is invalid — evict from cache
    tokenValidationCache.delete(cacheKey);
    return false;
  } catch {
    // Network error reaching Forgejo — trust the cached token if we had one,
    // otherwise treat as invalid to avoid passing a bad token downstream
    return lastValidated !== undefined;
  }
}

async function getForgejoToken(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const result = await pool.query(
    `SELECT "accessToken" FROM account WHERE "userId" = $1 AND "providerId" = 'forgejo' ORDER BY "createdAt" DESC LIMIT 1`,
    [session.user.id],
  );
  const token = result.rows[0]?.accessToken || null;
  if (!token) return null;

  const valid = await validateForgejoToken(token);
  return valid ? token : null;
}

export async function opApiFetch(
  path: string,
  init?: RequestInit,
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
  if (res.status === 204) return { deleted: true };
  return res.json();
}

export { getForgejoToken };
