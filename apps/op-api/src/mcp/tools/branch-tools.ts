import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForgejoClient } from "../../services/forgejo.js";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerBranchTools(
  server: McpServer,
  forgejo: ForgejoClient,
) {
  server.tool(
    "list_branches",
    "List branches in a repository.",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
    },
    async ({ org, repo }) => {
      const branches = await forgejo.listBranches(org, repo);
      return text(
        branches.map((b) => ({
          name: b.name,
          commit: b.commit.id.slice(0, 8),
          message: b.commit.message.split("\n")[0],
          protected: b.protected,
        })),
      );
    },
  );

  server.tool(
    "create_branch",
    "Create a new branch from an existing branch.",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      name: z.string().describe("New branch name"),
      from: z.string().default("main").describe("Base branch to create from"),
    },
    async ({ org, repo, name, from }) => {
      const branch = await forgejo.createBranch(org, repo, name, from);
      return text({
        created: true,
        name: branch.name,
        commit: branch.commit.id.slice(0, 8),
      });
    },
  );
}
