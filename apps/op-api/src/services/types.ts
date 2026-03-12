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
  status: "running" | "degraded" | "stopped";
  replicas: { ready: number; desired: number };
  url: string;
}

export interface ServiceStatus {
  name: string;
  namespace: string;
  ready: boolean;
  replicas: { ready: number; total: number };
  url: string;
}
