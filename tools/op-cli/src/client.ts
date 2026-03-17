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
  private readonly insecure: boolean;

  constructor(config: OpConfig) {
    this.baseUrl = config.url.replace(/\/+$/, "");
    this.token = config.token;
    this.insecure = config.insecure ?? false;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const fetchOpts: RequestInit & { tls?: { rejectUnauthorized: boolean } } = {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };

    if (this.insecure) {
      // Bun supports tls option; Node uses NODE_TLS_REJECT_UNAUTHORIZED
      (fetchOpts as Record<string, unknown>).tls = {
        rejectUnauthorized: false,
      };
    }

    const res = await fetch(url, fetchOpts);

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
    return this.request(
      "POST",
      `/api/v1/repos/${enc(org)}/${enc(template)}/generate`,
      {
        name,
        description,
      },
    );
  }

  async createRepo(
    org: string,
    name: string,
    description?: string,
  ): Promise<Repo> {
    return this.request("POST", `/api/v1/repos/${enc(org)}`, {
      name,
      description,
    });
  }

  async deleteRepo(org: string, repo: string): Promise<{ deleted: boolean }> {
    return this.request("DELETE", `/api/v1/repos/${enc(org)}/${enc(repo)}`);
  }

  // PRs
  async listPRs(org: string, repo: string, state = "open"): Promise<PR[]> {
    return this.request(
      "GET",
      `/api/v1/prs/${enc(org)}/${enc(repo)}?state=${state}`,
    );
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

  async mergePR(
    org: string,
    repo: string,
    number: number,
    method = "merge",
  ): Promise<{ merged: boolean }> {
    return this.request(
      "POST",
      `/api/v1/prs/${enc(org)}/${enc(repo)}/${number}/merge`,
      { method },
    );
  }

  // Pipelines
  async listPipelines(org: string, repo: string): Promise<Pipeline[]> {
    return this.request("GET", `/api/v1/pipelines/${enc(org)}/${enc(repo)}`);
  }

  async triggerPipeline(
    org: string,
    repo: string,
    branch = "main",
  ): Promise<Pipeline> {
    return this.request("POST", `/api/v1/pipelines/${enc(org)}/${enc(repo)}`, {
      branch,
    });
  }

  async getPipelineLogs(
    org: string,
    repo: string,
    id: number,
    step = 2,
  ): Promise<{ logs: string }> {
    return this.request(
      "GET",
      `/api/v1/pipelines/${enc(org)}/${enc(repo)}/${id}/logs?step=${step}`,
    );
  }

  // Issues
  async listIssues(
    org: string,
    repo: string,
    opts?: {
      state?: string;
      labels?: string;
      milestone?: string;
      assignee?: string;
    },
  ): Promise<Issue[]> {
    const params = new URLSearchParams();
    if (opts?.state) params.set("state", opts.state);
    if (opts?.labels) params.set("labels", opts.labels);
    if (opts?.milestone) params.set("milestone", opts.milestone);
    if (opts?.assignee) params.set("assignee", opts.assignee);
    const qs = params.toString();
    return this.request(
      "GET",
      `/api/v1/issues/${enc(org)}/${enc(repo)}${qs ? `?${qs}` : ""}`,
    );
  }

  async createIssue(
    org: string,
    repo: string,
    opts: {
      title: string;
      body?: string;
      labels?: number[];
      milestone?: number;
      assignees?: string[];
    },
  ): Promise<Issue> {
    return this.request(
      "POST",
      `/api/v1/issues/${enc(org)}/${enc(repo)}`,
      opts,
    );
  }

  async updateIssue(
    org: string,
    repo: string,
    number: number,
    opts: {
      title?: string;
      body?: string;
      state?: string;
      labels?: number[];
      milestone?: number;
      assignees?: string[];
    },
  ): Promise<Issue> {
    return this.request(
      "PATCH",
      `/api/v1/issues/${enc(org)}/${enc(repo)}/${number}`,
      opts,
    );
  }

  async commentOnIssue(
    org: string,
    repo: string,
    number: number,
    body: string,
  ): Promise<{ id: number; body: string }> {
    return this.request(
      "POST",
      `/api/v1/issues/${enc(org)}/${enc(repo)}/${number}/comments`,
      { body },
    );
  }

  // Labels
  async listLabels(org: string, repo: string): Promise<Label[]> {
    return this.request(
      "GET",
      `/api/v1/issues/${enc(org)}/${enc(repo)}/labels`,
    );
  }

  async createLabel(
    org: string,
    repo: string,
    opts: { name: string; color: string; description?: string },
  ): Promise<Label> {
    return this.request(
      "POST",
      `/api/v1/issues/${enc(org)}/${enc(repo)}/labels`,
      opts,
    );
  }

  // Milestones
  async listMilestones(
    org: string,
    repo: string,
    state?: string,
  ): Promise<Milestone[]> {
    const qs = state ? `?state=${enc(state)}` : "";
    return this.request(
      "GET",
      `/api/v1/issues/${enc(org)}/${enc(repo)}/milestones${qs}`,
    );
  }

  async createMilestone(
    org: string,
    repo: string,
    opts: { title: string; description?: string; due_on?: string },
  ): Promise<Milestone> {
    return this.request(
      "POST",
      `/api/v1/issues/${enc(org)}/${enc(repo)}/milestones`,
      opts,
    );
  }

  // Branches
  async listBranches(org: string, repo: string): Promise<Branch[]> {
    return this.request("GET", `/api/v1/branches/${enc(org)}/${enc(repo)}`);
  }

  async createBranch(
    org: string,
    repo: string,
    name: string,
    from = "main",
  ): Promise<Branch> {
    return this.request("POST", `/api/v1/branches/${enc(org)}/${enc(repo)}`, {
      name,
      from,
    });
  }

  async deleteBranch(
    org: string,
    repo: string,
    name: string,
  ): Promise<{ deleted: boolean }> {
    return this.request(
      "DELETE",
      `/api/v1/branches/${enc(org)}/${enc(repo)}/${enc(name)}`,
    );
  }

  // Files
  async getFileContent(
    org: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<FileContent> {
    const qs = ref ? `?ref=${enc(ref)}` : "";
    return this.request(
      "GET",
      `/api/v1/files/${enc(org)}/${enc(repo)}/${path}${qs}`,
    );
  }

  async createOrUpdateFile(
    org: string,
    repo: string,
    path: string,
    opts: { content: string; message: string; branch?: string; sha?: string },
  ): Promise<FileCommitResult> {
    return this.request(
      "PUT",
      `/api/v1/files/${enc(org)}/${enc(repo)}/${path}`,
      opts,
    );
  }

  // PR Reviews
  async approvePR(
    org: string,
    repo: string,
    number: number,
    body?: string,
  ): Promise<{ approved: boolean }> {
    return this.request(
      "POST",
      `/api/v1/prs/${enc(org)}/${enc(repo)}/${number}/approve`,
      { body: body || "" },
    );
  }

  // Apps
  async listApps(): Promise<App[]> {
    return this.request("GET", "/api/v1/apps");
  }

  async getAppStatus(org: string, repo: string): Promise<App> {
    return this.request("GET", `/api/v1/apps/${enc(org)}/${enc(repo)}`);
  }

  async deployApp(
    org: string,
    repo: string,
    branch = "main",
  ): Promise<Pipeline> {
    return this.request("POST", `/api/v1/pipelines/${enc(org)}/${enc(repo)}`, {
      branch,
    });
  }

  // Platform services (admin)
  async listServices(): Promise<{ services: ServiceStatus[] }> {
    return this.request("GET", "/api/v1/platform/services");
  }

  // Platform users (admin)
  async listUsers(): Promise<{ users: ForgejoUser[] }> {
    return this.request("GET", "/api/v1/platform/users");
  }

  async createUser(
    username: string,
    email: string,
  ): Promise<{ user: ForgejoUser; initialPassword: string }> {
    return this.request("POST", "/api/v1/platform/users", { username, email });
  }

  // Platform apps (admin)
  async listPlatformApps(): Promise<{ apps: App[]; orgs: Org[] }> {
    return this.request("GET", "/api/v1/platform/apps");
  }

  async createApp(
    org: string,
    name: string,
    description?: string,
  ): Promise<{ repo: Repo }> {
    return this.request("POST", "/api/v1/platform/apps", {
      org,
      name,
      description,
    });
  }

  // Instances
  async listInstances(all = false): Promise<{ instances: Instance[] }> {
    return this.request("GET", `/api/v1/instances${all ? "?all=true" : ""}`);
  }

  async createInstance(data: {
    slug: string;
    display_name: string;
    admin_email: string;
    tier?: string;
  }): Promise<{ instance: Instance }> {
    return this.request("POST", "/api/v1/instances", data);
  }

  async getInstance(slug: string): Promise<{
    instance: Instance;
    events: InstanceEvent[];
    services: Record<string, string> | null;
  }> {
    return this.request("GET", `/api/v1/instances/${enc(slug)}`);
  }

  async deleteInstance(slug: string): Promise<{ instance: Instance }> {
    return this.request("DELETE", `/api/v1/instances/${enc(slug)}`);
  }

  async getInstanceCredentials(
    slug: string,
  ): Promise<{ username: string; password: string }> {
    return this.request("GET", `/api/v1/instances/${enc(slug)}/credentials`);
  }

  async resetInstanceCredentials(
    slug: string,
  ): Promise<{ username: string; password: string }> {
    return this.request("POST", `/api/v1/instances/${enc(slug)}/credentials`);
  }

  async getInstanceKubeconfig(slug: string): Promise<{ kubeconfig: string }> {
    return this.request("GET", `/api/v1/instances/${enc(slug)}/kubeconfig`);
  }

  async listInstanceServices(
    slug: string,
  ): Promise<{ services: InstanceServiceStatus[] }> {
    return this.request("GET", `/api/v1/instances/${enc(slug)}/services`);
  }

  async listInstanceApps(slug: string): Promise<{ apps: InstanceApp[] }> {
    return this.request("GET", `/api/v1/instances/${enc(slug)}/apps`);
  }

  // Dev Pods (host-level)
  async listDevPods(): Promise<{ pods: DevPod[] }> {
    return this.request("GET", "/api/v1/dev-pods");
  }

  async createDevPod(opts?: {
    cpu_limit?: string;
    memory_limit?: string;
    storage_size?: string;
  }): Promise<{ pod: DevPod }> {
    return this.request("POST", "/api/v1/dev-pods", opts || {});
  }

  async getDevPod(username: string): Promise<{ pod: DevPod }> {
    return this.request("GET", `/api/v1/dev-pods/${enc(username)}`);
  }

  async controlDevPod(
    username: string,
    action: "start" | "stop",
  ): Promise<{ pod: DevPod }> {
    return this.request("PATCH", `/api/v1/dev-pods/${enc(username)}`, {
      action,
    });
  }

  async deleteDevPod(username: string): Promise<void> {
    return this.request("DELETE", `/api/v1/dev-pods/${enc(username)}`);
  }

  // Dev Pods (instance-scoped)
  async listInstanceDevPods(slug: string): Promise<{ pods: DevPod[] }> {
    return this.request("GET", `/api/v1/instances/${enc(slug)}/dev-pods`);
  }

  async createInstanceDevPod(
    slug: string,
    opts?: {
      cpu_limit?: string;
      memory_limit?: string;
      storage_size?: string;
    },
  ): Promise<{ pod: DevPod }> {
    return this.request(
      "POST",
      `/api/v1/instances/${enc(slug)}/dev-pods`,
      opts || {},
    );
  }

  async getInstanceDevPod(
    slug: string,
    username: string,
  ): Promise<{ pod: DevPod }> {
    return this.request(
      "GET",
      `/api/v1/instances/${enc(slug)}/dev-pods/${enc(username)}`,
    );
  }

  async controlInstanceDevPod(
    slug: string,
    username: string,
    action: "start" | "stop",
  ): Promise<{ pod: DevPod }> {
    return this.request(
      "PATCH",
      `/api/v1/instances/${enc(slug)}/dev-pods/${enc(username)}`,
      { action },
    );
  }

  async deleteInstanceDevPod(slug: string, username: string): Promise<void> {
    return this.request(
      "DELETE",
      `/api/v1/instances/${enc(slug)}/dev-pods/${enc(username)}`,
    );
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
  subdomain: string;
}

export interface ForgejoUser {
  id: number;
  login: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  avatar_url: string;
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

export interface Instance {
  id: number;
  slug: string;
  display_name: string;
  tier: string;
  status: string;
  admin_username: string;
  admin_email: string;
  created_at: string;
  updated_at: string;
  provisioned_at: string | null;
  owner_name?: string;
  owner_email?: string;
}

export interface InstanceEvent {
  phase: string;
  status: string;
  message: string;
  created_at: string;
}

export interface InstanceServiceStatus {
  name: string;
  namespace: string;
  ready: boolean;
  replicas: { ready: number; total: number };
  url: string;
}

export interface InstanceApp {
  name: string;
  namespace: string;
  org: string;
  repo: string;
  ready: boolean;
  replicas: { ready: number; total: number };
  url: string;
}

export interface DevPod {
  id: string;
  forgejo_username: string;
  instance_slug: string | null;
  status: string;
  pod_name: string;
  pvc_name: string;
  cpu_limit: string;
  memory_limit: string;
  storage_size: string;
  error_message: string | null;
  created_at: string;
  live_status?: string;
}
