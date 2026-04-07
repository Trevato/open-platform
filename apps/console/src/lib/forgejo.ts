const forgejoUrl =
  process.env.AUTH_FORGEJO_INTERNAL_URL || process.env.AUTH_FORGEJO_URL || "";

const adminUser = process.env.FORGEJO_ADMIN_USER || "";
const adminPass = process.env.FORGEJO_ADMIN_PASSWORD || "";

function authHeaders(): HeadersInit {
  return {
    Authorization: `Basic ${Buffer.from(`${adminUser}:${adminPass}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

async function fetchAllPages<T>(baseUrl: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const limit = 50;

  while (true) {
    const sep = baseUrl.includes("?") ? "&" : "?";
    const res = await fetch(`${baseUrl}${sep}limit=${limit}&page=${page}`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Forgejo API error: ${res.status}`);
    const items: T[] = await res.json();
    results.push(...items);
    if (items.length < limit) break;
    page++;
  }

  return results;
}

export interface ForgejoOrg {
  id: number;
  name: string;
  full_name: string;
  avatar_url: string;
  description: string;
}

export async function listOrgs(): Promise<ForgejoOrg[]> {
  return fetchAllPages<ForgejoOrg>(`${forgejoUrl}/api/v1/admin/orgs`);
}

export interface ForgejoRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  template: boolean;
  updated_at: string;
  html_url: string;
}

export async function listOrgRepos(org: string): Promise<ForgejoRepo[]> {
  return fetchAllPages<ForgejoRepo>(
    `${forgejoUrl}/api/v1/orgs/${encodeURIComponent(org)}/repos`,
  );
}

/**
 * Check if a user is a member of the system org.
 * Returns true if the user is a member (204), false otherwise (404).
 */
export async function isSystemOrgMember(username: string): Promise<boolean> {
  const res = await fetch(
    `${forgejoUrl}/api/v1/orgs/system/members/${encodeURIComponent(username)}`,
    { headers: authHeaders(), cache: "no-store" },
  );
  return res.status === 204;
}

/**
 * List repos accessible to a user via their own token.
 */
export async function listUserRepos(userToken: string): Promise<ForgejoRepo[]> {
  const results: ForgejoRepo[] = [];
  let page = 1;
  const limit = 50;

  while (true) {
    const res = await fetch(
      `${forgejoUrl}/api/v1/user/repos?limit=${limit}&page=${page}`,
      {
        headers: {
          Authorization: `token ${userToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) break;
    const items: ForgejoRepo[] = await res.json();
    results.push(...items);
    if (items.length < limit) break;
    page++;
  }

  return results;
}

export async function generateFromTemplate(
  templateOwner: string,
  templateRepo: string,
  opts: { owner: string; name: string; description?: string },
): Promise<ForgejoRepo> {
  const res = await fetch(
    `${forgejoUrl}/api/v1/repos/${encodeURIComponent(templateOwner)}/${encodeURIComponent(templateRepo)}/generate`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        owner: opts.owner,
        name: opts.name,
        description: opts.description || "",
        git_content: true,
        topics: true,
        labels: true,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Forgejo generate error: ${res.status} ${body}`);
  }
  return res.json();
}
