export interface ForgejoOrg {
  id: number;
  name: string;
  full_name: string;
  description: string;
  avatar_url: string;
  visibility: string;
}

export interface ForgejoRepo {
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
  permissions?: { admin: boolean; push: boolean; pull: boolean };
}

export interface ForgejoPR {
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

export interface ForgejoComment {
  id: number;
  body: string;
  user: { login: string };
  created_at: string;
}

export interface ForgejoUser {
  id: number;
  login: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  avatar_url: string;
}

export interface ForgejoTeam {
  id: number;
  name: string;
  description: string;
  permission: string;
  units: string[];
}

export interface ForgejoLabel {
  id: number;
  name: string;
  color: string;
  description: string;
  url: string;
}

export interface ForgejoMilestone {
  id: number;
  title: string;
  description: string;
  state: string;
  open_issues: number;
  closed_issues: number;
  due_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForgejoIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  user: { login: string; avatar_url: string };
  labels: ForgejoLabel[];
  milestone: ForgejoMilestone | null;
  assignees: { login: string }[];
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface ForgejoBranch {
  name: string;
  commit: {
    id: string;
    message: string;
    author: { name: string; email: string };
    timestamp: string;
  };
  protected: boolean;
}

export interface ForgejoContent {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  encoding: string;
  content: string;
  sha: string;
  url: string;
  html_url: string;
}

export interface ForgejoFileResponse {
  content: {
    name: string;
    path: string;
    sha: string;
    html_url: string;
  };
  commit: {
    sha: string;
    message: string;
  };
}

export interface WoodpeckerStep {
  id: number;
  pid: number;
  name: string;
  state: string;
  started: number;
  stopped: number;
}

export interface WoodpeckerWorkflow {
  id: number;
  pid: number;
  name: string;
  state: string;
  children: WoodpeckerStep[];
}

export interface WoodpeckerPipeline {
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
  workflows?: WoodpeckerWorkflow[];
}

export interface WoodpeckerRepo {
  id: number;
  forge_remote_id: string;
  full_name: string;
  name: string;
  owner: string;
  active: boolean;
}

export interface AppInfo {
  org: string;
  repo: string;
  namespace: string;
  ready: boolean;
  status: "running" | "degraded" | "stopped";
  replicas: { ready: number; desired: number; total: number };
  url: string;
}

export interface PreviewInfo {
  org: string;
  repo: string;
  pr: number;
  namespace: string;
  ready: boolean;
  status: "running" | "degraded" | "stopped";
  replicas: { ready: number; desired: number; total: number };
  url: string;
}

export interface ServiceStatus {
  name: string;
  namespace: string;
  ready: boolean;
  replicas: { ready: number; total: number };
  url: string;
  subdomain: string;
}

export interface InstanceServiceStatus {
  name: string;
  namespace: string;
  ready: boolean;
  replicas: { ready: number; total: number };
  url: string;
}

export interface InstanceAppInfo {
  name: string;
  namespace: string;
  org: string;
  repo: string;
  ready: boolean;
  replicas: { ready: number; total: number };
  url: string;
}
