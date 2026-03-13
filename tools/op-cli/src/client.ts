import type { OpConfig } from "./config.js";

export class OpClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpClientError";
  }
}

export class OpClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: OpConfig) {
    this.baseUrl = config.url.replace(/\/+$/, "");
    this.token = config.token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let message: string;
      try {
        const err = (await res.json()) as { error?: string };
        message = err.error || res.statusText;
      } catch {
        message = res.statusText;
      }
      throw new OpClientError(res.status, message);
    }

    return res.json() as Promise<T>;
  }

  // Status
  async getStatus(): Promise<PlatformStatus> {
    return this.request("GET", "/api/v1/status");
  }

  // Users
  async getMe(): Promise<User> {
    return this.request("GET", "/api/v1/users/me");
  }

  // Orgs
  async listOrgs(): Promise<Org[]> {
    return this.request("GET", "/api/v1/orgs");
  }

  async createOrg(name: string, description?: string): Promise<Org> {
    return this.request("POST", "/api/v1/orgs", { name, description });
  }

  // Repos
  async listRepos(org: string): Promise<Repo[]> {
    return this.request("GET", `/api/v1/repos/${enc(org)}`);
  }

  async generateFromTemplate(
    org: string,
    template: string,
    name: string,
    description?: string,
  ): Promise<Repo> {
    return this.request("POST", `/api/v1/repos/${enc(org)}/${enc(template)}/generate`, {
      name,
      description,
    });
  }

  async createRepo(
    org: string,
    name: string,
    description?: string,
  ): Promise<Repo> {
    return this.request("POST", `/api/v1/repos/${enc(org)}`, { name, description });
  }

  async deleteRepo(org: string, repo: string): Promise<{ deleted: boolean }> {
    return this.request("DELETE", `/api/v1/repos/${enc(org)}/${enc(repo)}`);
  }

  // PRs
  async listPRs(org: string, repo: string, state = "open"): Promise<PR[]> {
    return this.request("GET", `/api/v1/prs/${enc(org)}/${enc(repo)}?state=${state}`);
  }

  async createPR(
    org: string,
    repo: string,
    opts: { title: string; head: string; base?: string; body?: string },
  ): Promise<PR> {
    return this.request("POST", `/api/v1/prs/${enc(org)}/${enc(repo)}`, {
      title: opts.title,
      head: opts.head,
      base: opts.base || "main",
      body: opts.body || "",
    });
  }

  async mergePR(org: string, repo: string, number: number, method = "merge"): Promise<{ merged: boolean }> {
    return this.request("POST", `/api/v1/prs/${enc(org)}/${enc(repo)}/${number}/merge`, { method });
  }

  // Pipelines
  async listPipelines(org: string, repo: string): Promise<Pipeline[]> {
    return this.request("GET", `/api/v1/pipelines/${enc(org)}/${enc(repo)}`);
  }

  async triggerPipeline(org: string, repo: string, branch = "main"): Promise<Pipeline> {
    return this.request("POST", `/api/v1/pipelines/${enc(org)}/${enc(repo)}`, { branch });
  }

  async getPipelineLogs(
    org: string,
    repo: string,
    id: number,
    step = 1,
  ): Promise<{ logs: string }> {
    return this.request("GET", `/api/v1/pipelines/${enc(org)}/${enc(repo)}/${id}/logs?step=${step}`);
  }

  // Issues
  async listIssues(
    org: string,
    repo: string,
    opts?: { state?: string; labels?: string; milestone?: string; assignee?: string },
  ): Promise<Issue[]> {
    const params = new URLSearchParams();
    if (opts?.state) params.set("state", opts.state);
    if (opts?.labels) params.set("labels", opts.labels);
    if (opts?.milestone) params.set("milestone", opts.milestone);
    if (opts?.assignee) params.set("assignee", opts.assignee);
    const qs = params.toString();
    return this.request("GET", `/api/v1/issues/${enc(org)}/${enc(repo)}${qs ? `?${qs}` : ""}`);
  }

  async createIssue(
    org: string,
    repo: string,
    opts: { title: string; body?: string; labels?: number[]; milestone?: number; assignees?: string[] },
  ): Promise<Issue> {
    return this.request("POST", `/api/v1/issues/${enc(org)}/${enc(repo)}`, opts);
  }

  async updateIssue(
    org: string,
    repo: string,
    number: number,
    opts: { title?: string; body?: string; state?: string; labels?: number[]; milestone?: number; assignees?: string[] },
  ): Promise<Issue> {
    return this.request("PATCH", `/api/v1/issues/${enc(org)}/${enc(repo)}/${number}`, opts);
  }

  async commentOnIssue(
    org: string,
    repo: string,
    number: number,
    body: string,
  ): Promise<{ id: number; body: string }> {
    return this.request("POST", `/api/v1/issues/${enc(org)}/${enc(repo)}/${number}/comments`, { body });
  }

  // Labels
  async listLabels(org: string, repo: string): Promise<Label[]> {
    return this.request("GET", `/api/v1/issues/${enc(org)}/${enc(repo)}/labels`);
  }

  async createLabel(
    org: string,
    repo: string,
    opts: { name: string; color: string; description?: string },
  ): Promise<Label> {
    return this.request("POST", `/api/v1/issues/${enc(org)}/${enc(repo)}/labels`, opts);
  }

  // Milestones
  async listMilestones(org: string, repo: string, state?: string): Promise<Milestone[]> {
    const qs = state ? `?state=${enc(state)}` : "";
    return this.request("GET", `/api/v1/issues/${enc(org)}/${enc(repo)}/milestones${qs}`);
  }

  async createMilestone(
    org: string,
    repo: string,
    opts: { title: string; description?: string; due_on?: string },
  ): Promise<Milestone> {
    return this.request("POST", `/api/v1/issues/${enc(org)}/${enc(repo)}/milestones`, opts);
  }

  // Branches
  async listBranches(org: string, repo: string): Promise<Branch[]> {
    return this.request("GET", `/api/v1/branches/${enc(org)}/${enc(repo)}`);
  }

  async createBranch(org: string, repo: string, name: string, from = "main"): Promise<Branch> {
    return this.request("POST", `/api/v1/branches/${enc(org)}/${enc(repo)}`, { name, from });
  }

  async deleteBranch(org: string, repo: string, name: string): Promise<{ deleted: boolean }> {
    return this.request("DELETE", `/api/v1/branches/${enc(org)}/${enc(repo)}/${enc(name)}`);
  }

  // Files
  async getFileContent(
    org: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<FileContent> {
    const qs = ref ? `?ref=${enc(ref)}` : "";
    return this.request("GET", `/api/v1/files/${enc(org)}/${enc(repo)}/${path}${qs}`);
  }

  async createOrUpdateFile(
    org: string,
    repo: string,
    path: string,
    opts: { content: string; message: string; branch?: string; sha?: string },
  ): Promise<FileCommitResult> {
    return this.request("PUT", `/api/v1/files/${enc(org)}/${enc(repo)}/${path}`, opts);
  }

  // PR Reviews
  async approvePR(org: string, repo: string, number: number, body?: string): Promise<{ approved: boolean }> {
    return this.request("POST", `/api/v1/prs/${enc(org)}/${enc(repo)}/${number}/approve`, { body: body || "" });
  }

  // Apps
  async listApps(): Promise<App[]> {
    return this.request("GET", "/api/v1/apps");
  }

  async getAppStatus(org: string, repo: string): Promise<App> {
    return this.request("GET", `/api/v1/apps/${enc(org)}/${enc(repo)}`);
  }

  async deployApp(org: string, repo: string, branch = "main"): Promise<Pipeline> {
    return this.request("POST", `/api/v1/pipelines/${enc(org)}/${enc(repo)}`, { branch });
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

// Response types

export interface PlatformStatus {
  healthy: boolean;
  services: ServiceStatus[];
  apps: App[];
}

export interface ServiceStatus {
  name: string;
  namespace: string;
  ready: boolean;
  replicas: { ready: number; total: number };
  url: string;
}

export interface User {
  id: number;
  login: string;
  email: string;
  fullName: string;
  isAdmin: boolean;
  avatarUrl: string;
}

export interface Org {
  id: number;
  name: string;
  full_name: string;
  description: string;
  avatar_url: string;
  visibility: string;
}

export interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  owner: { login: string; id: number };
  html_url: string;
  clone_url: string;
  template: boolean;
  default_branch: string;
  updated_at: string;
  stars_count: number;
  forks_count: number;
  open_issues_count: number;
}

export interface PR {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  user: { login: string; avatar_url: string };
  head: { ref: string; label: string };
  base: { ref: string; label: string };
  html_url: string;
  mergeable: boolean;
  created_at: string;
  updated_at: string;
}

export interface Pipeline {
  id: number;
  number: number;
  status: string;
  event: string;
  branch: string;
  message: string;
  author: string;
  started: number;
  finished: number;
  created: number;
}

export interface Label {
  id: number;
  name: string;
  color: string;
  description: string;
}

export interface Milestone {
  id: number;
  title: string;
  description: string;
  state: string;
  open_issues: number;
  closed_issues: number;
  due_on: string | null;
}

export interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  user: { login: string; avatar_url: string };
  labels: Label[];
  milestone: Milestone | null;
  assignees: { login: string }[];
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  name: string;
  commit: {
    id: string;
    message: string;
    author: { name: string; email: string };
    timestamp: string;
  };
  protected: boolean;
}

export interface FileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string;
}

export interface FileCommitResult {
  content: { path: string; sha: string };
  commit: { sha: string; message: string };
}

export interface App {
  org: string;
  repo: string;
  namespace: string;
  status: "running" | "degraded" | "stopped";
  replicas: { ready: number; desired: number };
  url: string;
}
