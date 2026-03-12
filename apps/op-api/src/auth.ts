import type { Request, Response, NextFunction } from "express";

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

export interface AuthenticatedUser {
  id: number;
  login: string;
  email: string;
  fullName: string;
  isAdmin: boolean;
  avatarUrl: string;
  token: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
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

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      error:
        "Missing or invalid Authorization header. Use: Bearer <forgejo-token>",
    });
    return;
  }

  const token = authHeader.slice(7);
  const user = await validateToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = toAuthenticatedUser(user, token);
  next();
}

export async function authenticateRequest(
  req: Request,
): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const user = await validateToken(token);
  if (!user) return null;

  return toAuthenticatedUser(user, token);
}
