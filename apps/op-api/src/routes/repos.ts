import { Elysia, t } from "elysia";
import { authPlugin } from "../auth.js";
import { ForgejoClient } from "../services/forgejo.js";

const orgParams = t.Object({ org: t.String() });
const repoParams = t.Object({ org: t.String(), repo: t.String() });

export const reposPlugin = new Elysia({ prefix: "/repos" })
  .use(authPlugin)
  .get(
    "/:org",
    async ({ params: { org }, user }) => {
      const client = new ForgejoClient(user.token);
      return client.listRepos(org);
    },
    {
      params: orgParams,
      detail: { tags: ["Repos"], summary: "List repos in org" },
    },
  )
  .get(
    "/:org/:repo",
    async ({ params: { org, repo }, user }) => {
      const client = new ForgejoClient(user.token);
      return client.getRepo(org, repo);
    },
    {
      params: repoParams,
      detail: { tags: ["Repos"], summary: "Get repo" },
    },
  )
  .post(
    "/:org",
    async ({ params: { org }, body, user, set }) => {
      const client = new ForgejoClient(user.token);
      const repo = await client.createRepo(org, {
        name: body.name,
        description: body.description,
        private: body.private,
        auto_init: body.auto_init,
      });
      set.status = 201;
      return repo;
    },
    {
      params: orgParams,
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        private: t.Optional(t.Boolean({ default: true })),
        auto_init: t.Optional(t.Boolean({ default: true })),
      }),
      detail: { tags: ["Repos"], summary: "Create repo in org" },
    },
  )
  .delete(
    "/:org/:repo",
    async ({ params: { org, repo }, user, set }) => {
      const client = new ForgejoClient(user.token);
      const existed = await client.deleteRepo(org, repo);
      if (!existed) {
        set.status = 404;
        return { error: "Repository not found" };
      }
      return { deleted: true };
    },
    {
      params: repoParams,
      detail: { tags: ["Repos"], summary: "Delete repo" },
    },
  )
  .post(
    "/:org/:repo/generate",
    async ({ params: { org, repo }, body, user, set }) => {
      const client = new ForgejoClient(user.token);
      const result = await client.generateFromTemplate(org, repo, {
        owner: body.owner || org,
        name: body.name,
        description: body.description,
      });
      set.status = 201;
      return result;
    },
    {
      params: repoParams,
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        owner: t.Optional(t.String()),
      }),
      detail: { tags: ["Repos"], summary: "Generate repo from template" },
    },
  );
