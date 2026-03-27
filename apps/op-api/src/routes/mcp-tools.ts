import { Elysia } from "elysia";
import { authPlugin } from "../auth.js";

const MCP_TOOL_CATALOG = [
  {
    name: "Organizations",
    tools: [
      {
        name: "list_orgs",
        description: "List organizations accessible to the user",
      },
      {
        name: "create_org",
        description: "Create a new organization (admin only)",
      },
    ],
  },
  {
    name: "Repositories",
    tools: [
      {
        name: "list_repos",
        description: "List repositories in an organization",
      },
      { name: "get_repo", description: "Get repository details" },
      {
        name: "create_repo",
        description: "Create a new empty repository in an organization.",
      },
      {
        name: "delete_repo",
        description:
          "Delete a repository. This is destructive and cannot be undone.",
      },
      {
        name: "create_repo_from_template",
        description: "Create a new app from the system template",
      },
    ],
  },
  {
    name: "Pull Requests",
    tools: [
      { name: "list_prs", description: "List pull requests" },
      { name: "create_pr", description: "Create a pull request" },
      { name: "merge_pr", description: "Merge a pull request" },
      { name: "comment_on_pr", description: "Add a comment to a pull request" },
      {
        name: "approve_pr",
        description: "Approve a pull request with an optional review comment.",
      },
    ],
  },
  {
    name: "Issues",
    tools: [
      {
        name: "list_issues",
        description:
          "List issues in a repository. Returns issue numbers, titles, state, labels, assignees, and milestone.",
      },
      {
        name: "create_issue",
        description:
          "Create an issue with optional labels, milestone, and assignees in a single call.",
      },
      {
        name: "update_issue",
        description:
          "Update an issue's title, body, state, labels, milestone, or assignees. Only provided fields are changed.",
      },
      { name: "comment_on_issue", description: "Add a comment to an issue." },
      {
        name: "list_labels",
        description:
          "List labels in a repository. Returns label IDs, names, colors, and descriptions.",
      },
      { name: "create_label", description: "Create a label in a repository." },
      {
        name: "create_milestone",
        description: "Create a milestone in a repository.",
      },
    ],
  },
  {
    name: "Branches",
    tools: [
      { name: "list_branches", description: "List branches in a repository." },
      {
        name: "delete_branch",
        description:
          "Delete a branch from a repository. Useful for cleaning up after PR merges.",
      },
      {
        name: "create_branch",
        description: "Create a new branch from an existing branch.",
      },
    ],
  },
  {
    name: "Files",
    tools: [
      {
        name: "get_file_content",
        description:
          "Read a file from a repository. Returns decoded content (UTF-8).",
      },
      {
        name: "create_or_update_file",
        description:
          "Write a file to a repository via the contents API (creates a direct commit).",
      },
    ],
  },
  {
    name: "Pipelines",
    tools: [
      { name: "trigger_deploy", description: "Trigger a deployment pipeline" },
      {
        name: "get_pipeline_status",
        description: "Get pipeline status (latest if no number specified)",
      },
      {
        name: "get_pipeline_logs",
        description: "Get logs for a pipeline step",
      },
    ],
  },
  {
    name: "Applications",
    tools: [
      { name: "list_apps", description: "List all deployed applications" },
      {
        name: "get_app_status",
        description: "Get application deployment status",
      },
      {
        name: "get_platform_status",
        description: "Get platform health and all service statuses",
      },
    ],
  },
  {
    name: "Users",
    tools: [
      { name: "whoami", description: "Get current authenticated user info" },
    ],
  },
  {
    name: "Platform",
    tools: [
      {
        name: "list_platform_services",
        description: "List platform service statuses (admin only)",
      },
      {
        name: "list_platform_users",
        description: "List all Forgejo users (admin only). Paginated.",
      },
      {
        name: "create_platform_user",
        description: "Create a new Forgejo user (admin only)",
      },
      {
        name: "list_platform_apps",
        description: "List all deployed applications",
      },
      {
        name: "create_platform_app",
        description: "Create a new app from the system template (admin only)",
      },
    ],
  },
  {
    name: "Instances",
    tools: [
      { name: "list_instances", description: "List instances" },
      { name: "create_instance", description: "Create a new instance" },
      { name: "get_instance", description: "Get instance details" },
      {
        name: "delete_instance",
        description: "Delete (terminate) an instance",
      },
      {
        name: "get_instance_credentials",
        description: "Get instance admin credentials",
      },
      {
        name: "reset_instance_credentials",
        description: "Reset instance admin password",
      },
      {
        name: "get_instance_kubeconfig",
        description: "Get instance kubeconfig",
      },
      {
        name: "list_instance_services",
        description: "List services in an instance",
      },
      {
        name: "list_instance_apps",
        description: "List deployed apps in an instance",
      },
    ],
  },
  {
    name: "Dev Pods",
    tools: [
      {
        name: "list_dev_pods",
        description: "List dev pods on the host platform",
      },
      {
        name: "create_dev_pod",
        description: "Create a dev pod for the current user",
      },
      { name: "get_dev_pod", description: "Get dev pod status by username" },
      { name: "control_dev_pod", description: "Start or stop a dev pod" },
      { name: "delete_dev_pod", description: "Delete a dev pod" },
      {
        name: "list_instance_dev_pods",
        description: "List dev pods in an instance",
      },
      {
        name: "create_instance_dev_pod",
        description: "Create a dev pod in an instance",
      },
      {
        name: "get_instance_dev_pod",
        description: "Get dev pod status in an instance",
      },
      {
        name: "control_instance_dev_pod",
        description: "Start or stop a dev pod in an instance",
      },
      {
        name: "delete_instance_dev_pod",
        description: "Delete a dev pod in an instance",
      },
    ],
  },
  {
    name: "Agents",
    tools: [
      { name: "list_agents", description: "List all AI agents (admin only)" },
      { name: "get_agent", description: "Get an AI agent by slug" },
      {
        name: "create_agent",
        description:
          "Create a new AI agent with a Forgejo identity (admin only)",
      },
      {
        name: "update_agent",
        description: "Update an AI agent's configuration",
      },
      {
        name: "delete_agent",
        description: "Delete an AI agent and its Forgejo identity",
      },
      {
        name: "activate_agent",
        description: "Manually trigger an AI agent with a prompt",
      },
    ],
  },
] as const;

export const mcpToolsPlugin = new Elysia({ prefix: "/mcp" })
  .use(authPlugin)
  .get("/tools", () => ({ categories: MCP_TOOL_CATALOG }), {
    detail: { tags: ["MCP"], summary: "List available MCP tools by category" },
  });
