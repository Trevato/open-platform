import { t } from "elysia";

// ── Forgejo Response Types ──────────────────────────────────────────

export const ForgejoOrg = t.Object({
  id: t.Number(),
  name: t.String(),
  full_name: t.String(),
  description: t.String(),
  avatar_url: t.String(),
  visibility: t.String(),
});

export const ForgejoRepo = t.Object({
  id: t.Number(),
  name: t.String(),
  full_name: t.String(),
  description: t.String(),
  owner: t.Object({ login: t.String(), id: t.Number() }),
  html_url: t.String(),
  clone_url: t.String(),
  template: t.Boolean(),
  default_branch: t.String(),
  updated_at: t.String(),
  stars_count: t.Number(),
  forks_count: t.Number(),
  open_issues_count: t.Number(),
});

export const ForgejoPR = t.Object({
  id: t.Number(),
  number: t.Number(),
  title: t.String(),
  body: t.String(),
  state: t.String(),
  user: t.Object({ login: t.String(), avatar_url: t.String() }),
  head: t.Object({ ref: t.String(), label: t.String() }),
  base: t.Object({ ref: t.String(), label: t.String() }),
  html_url: t.String(),
  mergeable: t.Boolean(),
  created_at: t.String(),
  updated_at: t.String(),
});

export const ForgejoComment = t.Object({
  id: t.Number(),
  body: t.String(),
  user: t.Object({ login: t.String() }),
  created_at: t.String(),
});

export const ForgejoUser = t.Object({
  id: t.Number(),
  login: t.String(),
  email: t.String(),
  full_name: t.String(),
  is_admin: t.Boolean(),
  avatar_url: t.String(),
});

export const ForgejoLabel = t.Object({
  id: t.Number(),
  name: t.String(),
  color: t.String(),
  description: t.String(),
  url: t.String(),
});

export const ForgejoMilestone = t.Object({
  id: t.Number(),
  title: t.String(),
  description: t.String(),
  state: t.Union([t.Literal("open"), t.Literal("closed")]),
  open_issues: t.Number(),
  closed_issues: t.Number(),
  due_on: t.Nullable(t.String()),
  created_at: t.String(),
  updated_at: t.String(),
});

export const ForgejoIssue = t.Object({
  id: t.Number(),
  number: t.Number(),
  title: t.String(),
  body: t.String(),
  state: t.Union([t.Literal("open"), t.Literal("closed")]),
  user: t.Object({ login: t.String(), avatar_url: t.String() }),
  labels: t.Array(ForgejoLabel),
  milestone: t.Nullable(ForgejoMilestone),
  assignees: t.Array(t.Object({ login: t.String() })),
  html_url: t.String(),
  created_at: t.String(),
  updated_at: t.String(),
});

export const ForgejoBranch = t.Object({
  name: t.String(),
  commit: t.Object({
    id: t.String(),
    message: t.String(),
    author: t.Object({ name: t.String(), email: t.String() }),
    timestamp: t.String(),
  }),
  protected: t.Boolean(),
});

export const ForgejoFileContent = t.Object({
  name: t.String(),
  path: t.String(),
  sha: t.String(),
  size: t.Number(),
  content: t.String({ description: "Decoded file content" }),
});

export const ForgejoFileCommitResult = t.Object({
  content: t.Object({ path: t.String(), sha: t.String() }),
  commit: t.Object({ sha: t.String(), message: t.String() }),
});

// ── Woodpecker Types ────────────────────────────────────────────────

export const WoodpeckerPipeline = t.Object({
  id: t.Number(),
  number: t.Number(),
  status: t.Union([
    t.Literal("pending"),
    t.Literal("running"),
    t.Literal("success"),
    t.Literal("failure"),
    t.Literal("error"),
    t.Literal("killed"),
  ]),
  event: t.String(),
  branch: t.String(),
  message: t.String(),
  author: t.String(),
  started: t.Number(),
  finished: t.Number(),
  created: t.Number(),
});

// ── Platform Types ──────────────────────────────────────────────────

export const ServiceStatus = t.Object({
  name: t.String(),
  namespace: t.String(),
  ready: t.Boolean(),
  replicas: t.Object({ ready: t.Number(), total: t.Number() }),
  url: t.String(),
});

export const AppInfo = t.Object({
  name: t.String(),
  org: t.String(),
  repo: t.String(),
  namespace: t.String(),
  tier: t.Union([t.Literal("platform"), t.Literal("workload")]),
  status: t.Union([
    t.Literal("running"),
    t.Literal("degraded"),
    t.Literal("stopped"),
    t.Literal("pending"),
    t.Literal("deploying"),
  ]),
  replicas: t.Object({
    ready: t.Number(),
    desired: t.Number(),
    total: t.Number(),
  }),
  url: t.String(),
  repoUrl: t.String(),
  archived_at: t.Optional(t.String()),
  toggleable: t.Optional(t.Boolean()),
});

export const UserProfile = t.Object({
  id: t.Number(),
  login: t.String(),
  email: t.String(),
  fullName: t.String(),
  isAdmin: t.Boolean(),
  avatarUrl: t.String(),
});

// ── Common ──────────────────────────────────────────────────────────

export const ErrorResponse = t.Object({
  error: t.String(),
});

// ── Model registry for .model() ─────────────────────────────────────

export const models = {
  ForgejoOrg,
  ForgejoRepo,
  ForgejoPR,
  ForgejoComment,
  ForgejoUser,
  ForgejoLabel,
  ForgejoMilestone,
  ForgejoIssue,
  ForgejoBranch,
  ForgejoFileContent,
  ForgejoFileCommitResult,
  WoodpeckerPipeline,
  ServiceStatus,
  AppInfo,
  UserProfile,
  ErrorResponse,
};
