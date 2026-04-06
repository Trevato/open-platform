import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForgejoClient } from "../../services/forgejo.js";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerPrTools(server: McpServer, forgejo: ForgejoClient) {
  server.tool(
    "list_prs",
    "List pull requests",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      state: z
        .enum(["open", "closed", "all"])
        .default("open")
        .describe("Filter by state"),
    },
    async ({ org, repo, state }) => {
      const prs = await forgejo.listPRs(org, repo, state);
      return text(
        prs.map((pr) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          author: pr.user.login,
          head: pr.head.ref,
          base: pr.base.ref,
          url: pr.html_url,
        })),
      );
    },
  );

  server.tool(
    "create_pr",
    "Create a pull request",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      title: z.string().describe("PR title"),
      body: z.string().default("").describe("PR description"),
      head: z.string().describe("Source branch"),
      base: z.string().default("main").describe("Target branch"),
    },
    async ({ org, repo, title, body, head, base }) => {
      const pr = await forgejo.createPR(org, repo, {
        title,
        body,
        head,
        base,
      });
      return text({ created: true, number: pr.number, url: pr.html_url });
    },
  );

  server.tool(
    "merge_pr",
    "Merge a pull request",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      number: z.number().describe("PR number"),
      method: z.enum(["merge", "rebase", "squash"]).default("merge"),
    },
    async ({ org, repo, number, method }) => {
      await forgejo.mergePR(org, repo, number, method);
      return text({ merged: true, number });
    },
  );

  server.tool(
    "comment_on_pr",
    "Add a comment to a pull request",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      number: z.number().describe("PR number"),
      body: z.string().describe("Comment text"),
    },
    async ({ org, repo, number, body }) => {
      const comment = await forgejo.commentOnPR(org, repo, number, body);
      return text({ commented: true, id: comment.id });
    },
  );

  server.tool(
    "approve_pr",
    "Approve a pull request with an optional review comment.",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      number: z.number().describe("PR number"),
      body: z.string().default("").describe("Optional review comment"),
    },
    async ({ org, repo, number, body }) => {
      await forgejo.approvePR(org, repo, number, body);
      return text({ approved: true, number });
    },
  );

  server.tool(
    "get_pr_ci_status",
    "Get CI/CD status for a pull request. Returns commit statuses for the PR's head branch.",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      number: z.number().describe("PR number"),
    },
    async ({ org, repo, number }) => {
      const pr = await forgejo.getPR(org, repo, number);
      const statuses = await forgejo.getCommitStatuses(org, repo, pr.head.ref);
      const overall =
        statuses.length === 0
          ? "none"
          : statuses.every((s) => s.status === "success")
            ? "success"
            : statuses.some(
                  (s) => s.status === "failure" || s.status === "error",
                )
              ? "failure"
              : "pending";
      return text({
        pr: number,
        overall,
        statuses: statuses.map((s) => ({
          context: s.context,
          status: s.status,
          description: s.description,
          url: s.target_url,
        })),
      });
    },
  );

  server.tool(
    "get_pr_diff",
    "Get the unified diff of a pull request.",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      number: z.number().describe("PR number"),
    },
    async ({ org, repo, number }) => {
      const diff = await forgejo.getPRDiff(org, repo, number);
      return { content: [{ type: "text" as const, text: diff }] };
    },
  );
}
