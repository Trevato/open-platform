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
}
