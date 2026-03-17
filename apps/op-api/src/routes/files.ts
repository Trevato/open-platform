import { Elysia, t } from "elysia";
import { authPlugin } from "../auth.js";
import { ForgejoClient } from "../services/forgejo.js";

export const filesPlugin = new Elysia({ prefix: "/files" })
  .use(authPlugin)
  // GET /:org/:repo/* — read file content (decoded)
  .get(
    "/:org/:repo/*",
    async ({ params, query, user, set }) => {
      const filePath = params["*"];
      if (!filePath) {
        set.status = 400;
        return { error: "file path is required" };
      }
      const client = new ForgejoClient(user.token);
      const content = await client.getFileContent(
        params.org,
        params.repo,
        filePath,
        query.ref,
      );
      // Decode base64 content for convenience
      const decoded =
        content.encoding === "base64"
          ? Buffer.from(content.content, "base64").toString("utf-8")
          : content.content;
      return {
        name: content.name,
        path: content.path,
        sha: content.sha,
        size: content.size,
        content: decoded,
      };
    },
    {
      query: t.Object({
        ref: t.Optional(t.String()),
      }),
      detail: { tags: ["Files"], summary: "Get file content" },
    },
  )
  // PUT /:org/:repo/* — create or update file
  .put(
    "/:org/:repo/*",
    async ({ params, body, user, set }) => {
      const filePath = params["*"];
      if (!filePath) {
        set.status = 400;
        return { error: "file path is required" };
      }
      const client = new ForgejoClient(user.token);
      const result = await client.createOrUpdateFile(
        params.org,
        params.repo,
        filePath,
        {
          content: body.content,
          message: body.message,
          branch: body.branch,
          sha: body.sha,
        },
      );
      set.status = 201;
      return result;
    },
    {
      body: t.Object({
        content: t.String(),
        message: t.String(),
        branch: t.Optional(t.String()),
        sha: t.Optional(t.String()),
      }),
      detail: { tags: ["Files"], summary: "Create or update file" },
    },
  );
