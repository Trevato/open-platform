import { Elysia } from "elysia";
import { bearer } from "@elysiajs/bearer";

interface CachedUser {
  id: number;
  login: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  avatar_url: string;
  cachedAt: number;
}

const FORGEJO_URL =
  process.env.FORGEJO_INTERNAL_URL || process.env.FORGEJO_URL || "";
const TOKEN_CACHE = new Map<string, CachedUser>();
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_SIZE = 1000;

export interface AuthenticatedUser {
  id: number;
  login: string;
  email: string;
  fullName: string;
  isAdmin: boolean;
  avatarUrl: string;
  token: string;
}

async function validateToken(token: string): Promise<CachedUser | null> {
  const cached = TOKEN_CACHE.get(token);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const res = await fetch(`${FORGEJO_URL}/api/v1/user`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) return null;

    const user = await res.json();
    const cachedUser: CachedUser = {
      id: user.id,
      login: user.login,
      email: user.email,
      full_name: user.full_name || user.login,
      is_admin: user.is_admin || false,
      avatar_url: user.avatar_url || "",
      cachedAt: Date.now(),
    };

    if (TOKEN_CACHE.size >= CACHE_MAX_SIZE) {
      const oldest = TOKEN_CACHE.keys().next().value;
      if (oldest !== undefined) TOKEN_CACHE.delete(oldest);
    }
    TOKEN_CACHE.set(token, cachedUser);
    return cachedUser;
  } catch {
    return null;
  }
}

function toAuthenticatedUser(
  cached: CachedUser,
  token: string,
): AuthenticatedUser {
  return {
    id: cached.id,
    login: cached.login,
    email: cached.email,
    fullName: cached.full_name,
    isAdmin: cached.is_admin,
    avatarUrl: cached.avatar_url,
    token,
  };
}

export const authPlugin = new Elysia({ name: "auth" })
  .use(bearer())
  .onBeforeHandle(async ({ bearer: token, set }) => {
    if (!token) {
      set.status = 401;
      return {
        error:
          "Missing or invalid Authorization header. Use: Bearer <forgejo-token>",
      };
    }
    const cached = await validateToken(token);
    if (!cached) {
      set.status = 401;
      return { error: "Invalid or expired token" };
    }
  })
  .resolve(async ({ bearer: token }) => {
    // Token is guaranteed valid here — onBeforeHandle would have returned early
    const cached = (await validateToken(token!))!;
    return { user: toAuthenticatedUser(cached, token!) };
  })
  .as("scoped");

// Admin check: verify user is a member of the "system" org

const ADMIN_CACHE = new Map<string, { isAdmin: boolean; cachedAt: number }>();
const ADMIN_CACHE_TTL_MS = 30_000;

export async function isSystemOrgMember(
  token: string,
  username: string,
): Promise<boolean> {
  const cacheKey = `${token}:${username}`;
  const cached = ADMIN_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < ADMIN_CACHE_TTL_MS) {
    return cached.isAdmin;
  }

  try {
    const res = await fetch(
      `${FORGEJO_URL}/api/v1/orgs/system/members/${encodeURIComponent(username)}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/json",
        },
      },
    );
    const isAdmin = res.status === 204;
    if (ADMIN_CACHE.size >= CACHE_MAX_SIZE) {
      const oldest = ADMIN_CACHE.keys().next().value;
      if (oldest !== undefined) ADMIN_CACHE.delete(oldest);
    }
    ADMIN_CACHE.set(cacheKey, { isAdmin, cachedAt: Date.now() });
    return isAdmin;
  } catch {
    return false;
  }
}

export const requireAdminPlugin = new Elysia({ name: "require-admin" })
  .use(authPlugin)
  .onBeforeHandle(async ({ user, set }) => {
    const admin =
      user.isAdmin || (await isSystemOrgMember(user.token, user.login));
    if (!admin) {
      set.status = 403;
      return { error: "Admin access required" };
    }
  })
  .as("scoped");

/** Authenticate a raw web Request (for MCP handler) */
export async function authenticateRequest(
  req: Request,
): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const user = await validateToken(token);
  if (!user) return null;

  return toAuthenticatedUser(user, token);
}
