import db from "@/lib/db";

const FORGEJO_URL =
  process.env.AUTH_FORGEJO_INTERNAL_URL || process.env.AUTH_FORGEJO_URL;

/** Dedup in-flight refresh requests per userId (Forgejo refresh tokens are single-use) */
const pendingRefreshes = new Map<string, Promise<string | null>>();

async function refreshToken(userId: string): Promise<string | null> {
  const pending = pendingRefreshes.get(userId);
  if (pending) return pending;

  const promise = doRefreshToken(userId).finally(() => {
    pendingRefreshes.delete(userId);
  });
  pendingRefreshes.set(userId, promise);
  return promise;
}

async function doRefreshToken(userId: string): Promise<string | null> {
  const result = await db.query(
    `SELECT "refreshToken" FROM account WHERE "userId" = $1 AND "providerId" = 'forgejo' ORDER BY "createdAt" DESC LIMIT 1`,
    [userId],
  );
  const refreshToken = result.rows[0]?.refreshToken;
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${FORGEJO_URL}/login/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.AUTH_FORGEJO_ID!,
        client_secret: process.env.AUTH_FORGEJO_SECRET!,
      }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    await db.query(
      `UPDATE account SET "accessToken" = $1, "refreshToken" = $2,
       "accessTokenExpiresAt" = NOW() + INTERVAL '1 second' * $3, "updatedAt" = NOW()
       WHERE "userId" = $4 AND "providerId" = 'forgejo'
         AND id = (SELECT id FROM account WHERE "userId" = $4 AND "providerId" = 'forgejo' ORDER BY "createdAt" DESC LIMIT 1)`,
      [data.access_token, data.refresh_token, data.expires_in || 3600, userId],
    );
    return data.access_token;
  } catch {
    return null;
  }
}

export async function forgejoFetch(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const result = await db.query(
    `SELECT "accessToken" FROM account WHERE "userId" = $1 AND "providerId" = 'forgejo' ORDER BY "createdAt" DESC LIMIT 1`,
    [userId],
  );
  let token = result.rows[0]?.accessToken;
  if (!token) throw new Error("No Forgejo access token for user");

  let res = await fetch(`${FORGEJO_URL}/api/v1${path}`, {
    ...init,
    headers: { Authorization: `token ${token}`, ...init?.headers },
  });

  // If 401, try refreshing the token and retry once
  if (res.status === 401) {
    token = await refreshToken(userId);
    if (!token) throw new Error("Forgejo token expired — please sign in again");
    res = await fetch(`${FORGEJO_URL}/api/v1${path}`, {
      ...init,
      headers: { Authorization: `token ${token}`, ...init?.headers },
    });
  }

  return res;
}
