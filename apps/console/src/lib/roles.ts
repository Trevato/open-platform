import { isSystemOrgMember } from "./forgejo";

const cache = new Map<string, { isAdmin: boolean; exp: number }>();
const TTL = 30_000;

export async function checkIsAdmin(username: string): Promise<boolean> {
  const cached = cache.get(username);
  if (cached && cached.exp > Date.now()) return cached.isAdmin;
  const result = await isSystemOrgMember(username);
  cache.set(username, { isAdmin: result, exp: Date.now() + TTL });
  return result;
}
