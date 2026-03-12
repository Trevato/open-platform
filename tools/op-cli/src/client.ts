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

export interface App {
  org: string;
  repo: string;
  namespace: string;
  status: "running" | "degraded" | "stopped";
  replicas: { ready: number; desired: number };
  url: string;
}
