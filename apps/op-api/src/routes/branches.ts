import { Elysia, t } from "elysia";
import { authPlugin } from "../auth.js";
import { ForgejoClient } from "../services/forgejo.js";

const repoParams = t.Object({ org: t.String(), repo: t.String() });

export const branchesPlugin = new Elysia({ prefix: "/branches" })
  .use(authPlugin)
  .get(
    "/:org/:repo",
    async ({ params: { org, repo }, user }) => {
      const client = new ForgejoClient(user.token);
      return client.listBranches(org, repo);
    },
    {
      params: repoParams,
      detail: { tags: ["Branches"], summary: "List branches" },
    },
  )
  .post(
    "/:org/:repo",
    async ({ params: { org, repo }, body, user, set }) => {
      const client = new ForgejoClient(user.token);
      const branch = await client.createBranch(org, repo, body.name, body.from);
      set.status = 201;
      return branch;
    },
    {
      params: repoParams,
      body: t.Object({
        name: t.String({ minLength: 1 }),
        from: t.Optional(t.String()),
      }),
      detail: { tags: ["Branches"], summary: "Create branch" },
    },
  )
  // Wildcard route to support branch names with slashes (e.g. feat/my-feature)
  .delete(
    "/:org/:repo/*",
    async ({ params, user, set }) => {
      const branchName = params["*"];
      if (!branchName) {
        set.status = 400;
        return { error: "branch name is required" };
      }
      const client = new ForgejoClient(user.token);
      const existed = await client.deleteBranch(
        params.org,
        params.repo,
        branchName,
      );
      if (!existed) {
        set.status = 404;
        return {
          error: `Branch "${branchName}" not found in ${params.org}/${params.repo}`,
        };
      }
      return { deleted: true };
    },
    {
      detail: { tags: ["Branches"], summary: "Delete branch" },
    },
  );
