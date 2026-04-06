import { forgejoFetch } from "@/lib/forgejo";

export interface ForgejoOrgMembership {
  name: string;
}

export async function getUserOrgs(
  userId: string,
): Promise<ForgejoOrgMembership[]> {
  try {
    const res = await forgejoFetch(userId, "/user/orgs");
    if (!res.ok) return [];
    const orgs = (await res.json()) as Array<{
      username: string;
      name: string;
    }>;
    return orgs.map((o) => ({ name: o.username || o.name }));
  } catch {
    return [];
  }
}
