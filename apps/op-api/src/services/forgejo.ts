import type {
  ForgejoOrg,
  ForgejoRepo,
  ForgejoPR,
  ForgejoComment,
  ForgejoUser,
  ForgejoTeam,
} from "./types.js";

const FORGEJO_URL =
  process.env.FORGEJO_INTERNAL_URL || process.env.FORGEJO_URL || "";

export class ForgejoClient {
  constructor(private token: string) {}

  private headers(): HeadersInit {
    return {
      Authorization: `token ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private async fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${FORGEJO_URL}${path}`, {
      ...init,
      headers: { ...this.headers(), ...init?.headers },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Forgejo API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  private async fetchAllPages<T>(path: string): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    const limit = 50;
    while (true) {
      const sep = path.includes("?") ? "&" : "?";
      const items = await this.fetchJSON<T[]>(
        `${path}${sep}limit=${limit}&page=${page}`,
      );
      results.push(...items);
      if (items.length < limit) break;
      page++;
    }
    return results;
  }

  // Orgs

  async listOrgs(): Promise<ForgejoOrg[]> {
    return this.fetchAllPages("/api/v1/user/orgs");
  }

  async createOrg(
    name: string,
    opts?: { description?: string; visibility?: string },
  ): Promise<ForgejoOrg> {
    return this.fetchJSON("/api/v1/orgs", {
      method: "POST",
      body: JSON.stringify({
        username: name,
        description: opts?.description || "",
        visibility: opts?.visibility || "private",
      }),
    });
  }

  async deleteOrg(name: string): Promise<void> {
    const res = await fetch(
      `${FORGEJO_URL}/api/v1/orgs/${encodeURIComponent(name)}`,
      {
        method: "DELETE",
        headers: this.headers(),
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Forgejo delete org ${res.status}`);
    }
  }

  // Repos

  async listRepos(org: string): Promise<ForgejoRepo[]> {
    return this.fetchAllPages(
      `/api/v1/orgs/${encodeURIComponent(org)}/repos`,
    );
  }

  async getRepo(owner: string, name: string): Promise<ForgejoRepo> {
    return this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    );
  }

  async generateFromTemplate(
    templateOwner: string,
    templateRepo: string,
    opts: { owner: string; name: string; description?: string },
  ): Promise<ForgejoRepo> {
    return this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(templateOwner)}/${encodeURIComponent(templateRepo)}/generate`,
      {
        method: "POST",
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
  }

  // Pull Requests

  async listPRs(
    owner: string,
    repo: string,
    state: string = "open",
  ): Promise<ForgejoPR[]> {
    return this.fetchAllPages(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${state}`,
    );
  }

  async createPR(
    owner: string,
    repo: string,
    opts: { title: string; body: string; head: string; base: string },
  ): Promise<ForgejoPR> {
    return this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
      {
        method: "POST",
        body: JSON.stringify(opts),
      },
    );
  }

  async mergePR(
    owner: string,
    repo: string,
    index: number,
    method: string = "merge",
  ): Promise<void> {
    const res = await fetch(
      `${FORGEJO_URL}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${index}/merge`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ Do: method }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Forgejo merge PR ${res.status}: ${body}`);
    }
  }

  async commentOnPR(
    owner: string,
    repo: string,
    index: number,
    body: string,
  ): Promise<ForgejoComment> {
    return this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${index}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body }),
      },
    );
  }

  async listPRComments(
    owner: string,
    repo: string,
    index: number,
  ): Promise<ForgejoComment[]> {
    return this.fetchAllPages(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${index}/comments`,
    );
  }

  // Teams

  async listOrgTeams(org: string): Promise<ForgejoTeam[]> {
    return this.fetchAllPages(
      `/api/v1/orgs/${encodeURIComponent(org)}/teams`,
    );
  }

  async listTeamMembers(teamId: number): Promise<ForgejoUser[]> {
    return this.fetchAllPages(`/api/v1/teams/${teamId}/members`);
  }

  // Users

  async getCurrentUser(): Promise<ForgejoUser> {
    return this.fetchJSON("/api/v1/user");
  }
}
