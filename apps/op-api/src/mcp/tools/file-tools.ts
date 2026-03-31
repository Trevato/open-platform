import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForgejoClient } from "../../services/forgejo.js";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerFileTools(server: McpServer, forgejo: ForgejoClient) {
  server.tool(
    "get_file_content",
    "Read a file from a repository. Returns decoded content (UTF-8). Use `ref` to read from a specific branch or commit.",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      path: z.string().describe("File path (e.g. 'src/index.ts')"),
      ref: z.string().optional().describe("Branch name, tag, or commit SHA"),
    },
    async ({ org, repo, path, ref }) => {
      const file = await forgejo.getFileContent(org, repo, path, ref);
      const decoded =
        file.encoding === "base64"
          ? Buffer.from(file.content, "base64").toString("utf-8")
          : file.content;
      return text({
        path: file.path,
        sha: file.sha,
        size: file.size,
        content: decoded,
      });
    },
  );

  server.tool(
    "create_or_update_file",
    "Write a file to a repository via the contents API (creates a direct commit). To update an existing file, provide its current `sha` (from get_file_content).",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      path: z.string().describe("File path (e.g. 'src/index.ts')"),
      content: z
        .string()
        .describe("File content (plain text, will be base64-encoded)"),
      message: z.string().describe("Commit message"),
      branch: z
        .string()
        .optional()
        .describe("Branch to commit to (defaults to repo default)"),
      sha: z
        .string()
        .optional()
        .describe(
          "Current file SHA (required for updates, omit for new files)",
        ),
    },
    async ({ org, repo, path, content, message, branch, sha }) => {
      const result = await forgejo.createOrUpdateFile(org, repo, path, {
        content,
        message,
        branch,
        sha,
      });
      return text({
        committed: true,
        path: result.content.path,
        sha: result.content.sha,
        commit: result.commit.sha.slice(0, 8),
      });
    },
  );

  server.tool(
    "batch_update_files",
    "Write multiple files to a repository in a single atomic commit. Uses the 'upload' operation (upsert) by default — no need to know if files exist. Much more efficient than create_or_update_file for multi-file changes.",
    {
      org: z.string().describe("Organization or owner name"),
      repo: z.string().describe("Repository name"),
      message: z.string().describe("Commit message"),
      branch: z
        .string()
        .optional()
        .describe("Branch to commit to (defaults to repo default)"),
      files: z
        .array(
          z.object({
            path: z.string().describe("File path (e.g. 'src/index.ts')"),
            content: z
              .string()
              .optional()
              .describe(
                "File content (plain text). Omit for delete operations",
              ),
            operation: z
              .enum(["create", "update", "upload", "delete"])
              .default("upload")
              .describe(
                "File operation: 'upload' (upsert, recommended), 'create', 'update', or 'delete'",
              ),
          }),
        )
        .describe("Files to create, update, or delete"),
    },
    async ({ org, repo, message, branch, files }) => {
      const result = await forgejo.changeFiles(org, repo, {
        message,
        branch,
        files,
      });
      return text({
        committed: true,
        files: files.map((f) => ({ path: f.path, operation: f.operation })),
        commit: result.commit.sha.slice(0, 8),
      });
    },
  );
}
