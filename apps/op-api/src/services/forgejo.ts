import type {
  ForgejoOrg,
  ForgejoRepo,
  ForgejoPR,
  ForgejoComment,
  ForgejoUser,
  ForgejoTeam,
  ForgejoIssue,
  ForgejoLabel,
  ForgejoMilestone,
  ForgejoBranch,
  ForgejoContent,
  ForgejoFileResponse,
  ForgejoCommitStatus,
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

  async deleteOrg(name: string): Promise<boolean> {
    const res = await fetch(
      `${FORGEJO_URL}/api/v1/orgs/${encodeURIComponent(name)}`,
      {
        method: "DELETE",
        headers: this.headers(),
      },
    );
    if (res.status === 404) return false;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Forgejo API ${res.status}: ${body}`);
    }
    return true;
  }

  // Repos

  async listRepos(org: string): Promise<ForgejoRepo[]> {
    return this.fetchAllPages(`/api/v1/orgs/${encodeURIComponent(org)}/repos`);
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

  async createRepo(
    org: string,
    opts: {
      name: string;
      description?: string;
      private?: boolean;
      auto_init?: boolean;
    },
  ): Promise<ForgejoRepo> {
    return this.fetchJSON(`/api/v1/orgs/${encodeURIComponent(org)}/repos`, {
      method: "POST",
      body: JSON.stringify({
        name: opts.name,
        description: opts.description || "",
        private: opts.private ?? true,
        auto_init: opts.auto_init ?? true,
      }),
    });
  }

  async deleteRepo(owner: string, name: string): Promise<boolean> {
    const res = await fetch(
      `${FORGEJO_URL}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      { method: "DELETE", headers: this.headers() },
    );
    if (res.status === 404) return false;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Forgejo API ${res.status}: ${body}`);
    }
    return true;
  }

  // Pull Requests

  async getPR(owner: string, repo: string, index: number): Promise<ForgejoPR> {
    return this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${index}`,
    );
  }

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
      if (res.status === 405) {
        throw new Error(
          `Cannot merge PR #${index}: merge conflict or branch is not mergeable. Resolve conflicts and try again.`,
        );
      }
      if (res.status === 409) {
        throw new Error(
          `Cannot merge PR #${index}: head branch is out of date. Update the branch and try again.`,
        );
      }
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

  // Issues

  async getIssue(
    owner: string,
    repo: string,
    index: number,
  ): Promise<ForgejoIssue> {
    return this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${index}`,
    );
  }

  async listIssues(
    owner: string,
    repo: string,
    opts?: {
      state?: string;
      labels?: string;
      milestone?: string;
      assignee?: string;
      type?: string;
    },
  ): Promise<ForgejoIssue[]> {
    const params = new URLSearchParams();
    if (opts?.state) params.set("state", opts.state);
    if (opts?.labels) params.set("labels", opts.labels);
    if (opts?.milestone) params.set("milestone", opts.milestone);
    if (opts?.assignee) params.set("assigned_by", opts.assignee);
    params.set("type", opts?.type || "issues");
    const qs = params.toString();
    return this.fetchAllPages(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues${qs ? `?${qs}` : ""}`,
    );
  }

  async createIssue(
    owner: string,
    repo: string,
    opts: {
      title: string;
      body?: string;
      labels?: number[];
      milestone?: number;
      assignees?: string[];
    },
  ): Promise<ForgejoIssue> {
    return this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
      {
        method: "POST",
        body: JSON.stringify(opts),
      },
    );
  }

  async updateIssue(
    owner: string,
    repo: string,
    index: number,
    opts: {
      title?: string;
      body?: string;
      state?: string;
      labels?: number[];
      milestone?: number;
      assignees?: string[];
    },
  ): Promise<ForgejoIssue> {
    const base = `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${index}`;

    // Forgejo's PATCH /issues/{n} doesn't reliably replace labels.
    // Use the dedicated PUT /labels endpoint for atomic label replacement.
    if (opts.labels !== undefined) {
      await this.fetchJSON(`${base}/labels`, {
        method: "PUT",
        body: JSON.stringify({ labels: opts.labels }),
      });
    }

    // PATCH remaining fields (omit labels since we handled them above)
    const { labels: _labels, ...rest } = opts;
    return this.fetchJSON(base, {
      method: "PATCH",
      body: JSON.stringify(rest),
    });
  }

  async commentOnIssue(
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

  // Labels

  async listLabels(owner: string, repo: string): Promise<ForgejoLabel[]> {
    return this.fetchAllPages(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`,
    );
  }

  async createLabel(
    owner: string,
    repo: string,
    opts: { name: string; color: string; description?: string },
  ): Promise<ForgejoLabel> {
    return this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`,
      {
        method: "POST",
        body: JSON.stringify(opts),
      },
    );
  }

  // Milestones

  async listMilestones(
    owner: string,
    repo: string,
    state?: string,
  ): Promise<ForgejoMilestone[]> {
    const qs = state ? `?state=${encodeURIComponent(state)}` : "";
    return this.fetchAllPages(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones${qs}`,
    );
  }

  async createMilestone(
    owner: string,
    repo: string,
    opts: { title: string; description?: string; due_on?: string },
  ): Promise<ForgejoMilestone> {
    return this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones`,
      {
        method: "POST",
        body: JSON.stringify(opts),
      },
    );
  }

  // Branches

  async listBranches(owner: string, repo: string): Promise<ForgejoBranch[]> {
    return this.fetchAllPages(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`,
    );
  }

  async deleteBranch(
    owner: string,
    repo: string,
    name: string,
  ): Promise<boolean> {
    const res = await fetch(
      `${FORGEJO_URL}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(name)}`,
      { method: "DELETE", headers: this.headers() },
    );
    if (res.status === 404) return false;
    if (!res.ok) {
      const body = await res.text();
      // Forgejo returns 500 for "object does not exist" — normalize to 404
      if (body.includes("object does not exist")) {
        return false;
      }
      throw new Error(`Forgejo API ${res.status}: ${body}`);
    }
    return true;
  }

  async createBranch(
    owner: string,
    repo: string,
    name: string,
    from?: string,
  ): Promise<ForgejoBranch> {
    return this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`,
      {
        method: "POST",
        body: JSON.stringify({
          new_branch_name: name,
          old_branch_name: from || "main",
        }),
      },
    );
  }

  // File Contents

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<ForgejoContent> {
    const qs = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    return this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${qs}`,
    );
  }

  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    opts: {
      content: string;
      message: string;
      branch?: string;
      sha?: string;
    },
  ): Promise<ForgejoFileResponse> {
    // Forgejo: POST to create new files, PUT (with sha) to update existing
    const method = opts.sha ? "PUT" : "POST";
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    return this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
      {
        method,
        body: JSON.stringify({
          content: Buffer.from(opts.content).toString("base64"),
          message: opts.message,
          branch: opts.branch,
          ...(opts.sha ? { sha: opts.sha } : {}),
        }),
      },
    );
  }

  async changeFiles(
    owner: string,
    repo: string,
    opts: {
      message: string;
      branch?: string;
      files: Array<{
        operation: "create" | "update" | "upload" | "delete";
        path: string;
        content?: string;
      }>;
    },
  ): Promise<ForgejoFileResponse> {
    // Resolve "upload" (upsert) to "create" or "update" by checking existence
    const resolvedFiles = await Promise.all(
      opts.files.map(async (f) => {
        let operation = f.operation;
        if (operation === "upload") {
          try {
            const ref = opts.branch || "";
            const refParam = ref ? `?ref=${encodeURIComponent(ref)}` : "";
            await this.fetchJSON(
              `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${f.path}${refParam}`,
            );
            operation = "update";
          } catch {
            operation = "create";
          }
        }
        return {
          operation,
          path: f.path,
          ...(f.content != null
            ? { content: Buffer.from(f.content).toString("base64") }
            : {}),
        };
      }),
    );

    return this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`,
      {
        method: "POST",
        body: JSON.stringify({
          message: opts.message,
          branch: opts.branch,
          files: resolvedFiles,
        }),
      },
    );
  }

  // PR Reviews

  async approvePR(
    owner: string,
    repo: string,
    index: number,
    body?: string,
  ): Promise<void> {
    await this.fetchJSON(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${index}/reviews`,
      {
        method: "POST",
        body: JSON.stringify({
          event: "APPROVED",
          body: body || "",
        }),
      },
    );
  }

  // Teams

  async listOrgTeams(org: string): Promise<ForgejoTeam[]> {
    return this.fetchAllPages(`/api/v1/orgs/${encodeURIComponent(org)}/teams`);
  }

  async listTeamMembers(teamId: number): Promise<ForgejoUser[]> {
    return this.fetchAllPages(`/api/v1/teams/${teamId}/members`);
  }

  // Users

  async getCurrentUser(): Promise<ForgejoUser> {
    return this.fetchJSON("/api/v1/user");
  }

  // Commit Statuses

  async getCommitStatuses(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<ForgejoCommitStatus[]> {
    return this.fetchAllPages(
      `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}/statuses`,
    );
  }

  // PR Diff

  async getPRDiff(owner: string, repo: string, index: number): Promise<string> {
    const res = await fetch(
      `${FORGEJO_URL}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${index}.diff`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Forgejo API ${res.status}: ${body}`);
    }
    return res.text();
  }
}
