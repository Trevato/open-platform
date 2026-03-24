import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForgejoClient } from "../../services/forgejo.js";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerIssueTools(server: McpServer, forgejo: ForgejoClient) {
  server.tool(
    "list_issues",
    "List issues in a repository. Returns issue numbers, titles, state, labels, assignees, and milestone.",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      state: z
        .enum(["open", "closed", "all"])
        .default("open")
        .describe("Filter by state"),
      labels: z
        .string()
        .optional()
        .describe("Comma-separated label names to filter by"),
      milestone: z.string().optional().describe("Milestone name to filter by"),
      assignee: z
        .string()
        .optional()
        .describe("Username to filter by assignee"),
    },
    async ({ org, repo, state, labels, milestone, assignee }) => {
      const issues = await forgejo.listIssues(org, repo, {
        state,
        labels,
        milestone,
        assignee,
      });
      return text(
        issues.map((i) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          labels: (i.labels || []).map((l) => l.name),
          assignees: (i.assignees || []).map((a) => a.login),
          milestone: i.milestone?.title ?? null,
          url: i.html_url,
        })),
      );
    },
  );

  server.tool(
    "create_issue",
    "Create an issue with optional labels, milestone, and assignees in a single call. Labels use numeric IDs (call list_labels first). Milestone uses numeric ID (call create_milestone or list milestones first).",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      title: z.string().describe("Issue title"),
      body: z.string().default("").describe("Issue body (markdown)"),
      labels: z.array(z.number()).optional().describe("Label IDs to attach"),
      milestone: z.number().optional().describe("Milestone ID"),
      assignees: z.array(z.string()).optional().describe("Usernames to assign"),
    },
    async ({ org, repo, title, body, labels, milestone, assignees }) => {
      const issue = await forgejo.createIssue(org, repo, {
        title,
        body,
        labels,
        milestone,
        assignees,
      });
      return text({
        created: true,
        number: issue.number,
        url: issue.html_url,
      });
    },
  );

  server.tool(
    "update_issue",
    "Update an issue's title, body, state, labels, milestone, or assignees. Only provided fields are changed.",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      number: z.number().describe("Issue number"),
      title: z.string().optional().describe("New title"),
      body: z.string().optional().describe("New body"),
      state: z.enum(["open", "closed"]).optional().describe("New state"),
      labels: z.array(z.number()).optional().describe("Replace labels (by ID)"),
      milestone: z.number().optional().describe("New milestone ID"),
      assignees: z.array(z.string()).optional().describe("Replace assignees"),
    },
    async ({
      org,
      repo,
      number,
      title,
      body,
      state,
      labels,
      milestone,
      assignees,
    }) => {
      const opts: Record<string, unknown> = {};
      if (title !== undefined) opts.title = title;
      if (body !== undefined) opts.body = body;
      if (state !== undefined) opts.state = state;
      if (labels !== undefined) opts.labels = labels;
      if (milestone !== undefined) opts.milestone = milestone;
      if (assignees !== undefined) opts.assignees = assignees;
      const issue = await forgejo.updateIssue(
        org,
        repo,
        number,
        opts as Parameters<typeof forgejo.updateIssue>[3],
      );
      return text({
        updated: true,
        number: issue.number,
        state: issue.state,
        url: issue.html_url,
      });
    },
  );

  server.tool(
    "comment_on_issue",
    "Add a comment to an issue.",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      number: z.number().describe("Issue number"),
      body: z.string().describe("Comment text (markdown)"),
    },
    async ({ org, repo, number, body }) => {
      const comment = await forgejo.commentOnIssue(org, repo, number, body);
      return text({ commented: true, id: comment.id });
    },
  );

  server.tool(
    "list_labels",
    "List labels in a repository. Returns label IDs, names, colors, and descriptions. Use label IDs when creating or updating issues.",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
    },
    async ({ org, repo }) => {
      const labels = await forgejo.listLabels(org, repo);
      return text(
        labels.map((l) => ({
          id: l.id,
          name: l.name,
          color: l.color,
          description: l.description,
        })),
      );
    },
  );

  server.tool(
    "create_label",
    "Create a label in a repository.",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      name: z.string().describe("Label name"),
      color: z.string().describe("Hex color without # (e.g. 'e11d48')"),
      description: z.string().default("").describe("Label description"),
    },
    async ({ org, repo, name, color, description }) => {
      const label = await forgejo.createLabel(org, repo, {
        name,
        color: color.startsWith("#") ? color : `#${color}`,
        description,
      });
      return text({ created: true, id: label.id, name: label.name });
    },
  );

  server.tool(
    "create_milestone",
    "Create a milestone in a repository. Returns the milestone ID for use in create_issue and update_issue.",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      title: z.string().describe("Milestone title"),
      description: z.string().default("").describe("Milestone description"),
      due_on: z
        .string()
        .optional()
        .describe("Due date (ISO 8601, e.g. '2025-06-01T00:00:00Z')"),
    },
    async ({ org, repo, title, description, due_on }) => {
      const ms = await forgejo.createMilestone(org, repo, {
        title,
        description,
        due_on,
      });
      return text({ created: true, id: ms.id, title: ms.title });
    },
  );
}
