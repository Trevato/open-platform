import { Elysia, t } from "elysia";
import { authPlugin } from "../auth.js";
import { ForgejoClient } from "../services/forgejo.js";

const orgRepoParams = {
  org: t.String(),
  repo: t.String(),
};

const orgRepoNumberParams = {
  ...orgRepoParams,
  number: t.String(),
};

export const prsPlugin = new Elysia({ prefix: "/prs" })
  .use(authPlugin)
  .get(
    "/:org/:repo",
    async ({ params: { org, repo }, query, user }) => {
      const client = new ForgejoClient(user.token);
      return client.listPRs(org, repo, query.state ?? "open");
    },
    {
      params: t.Object(orgRepoParams),
      query: t.Object({
        state: t.Optional(t.String({ default: "open" })),
      }),
      detail: { tags: ["PRs"], summary: "List pull requests" },
    },
  )
  .get(
    "/:org/:repo/:number",
    async ({ params: { org, repo, number }, user, set }) => {
      if (!/^\d+$/.test(number)) {
        set.status = 400;
        return { error: "Invalid PR number" };
      }
      const index = parseInt(number);
      if (index < 1) {
        set.status = 400;
        return { error: "Invalid PR number" };
      }
      const client = new ForgejoClient(user.token);
      return client.getPR(org, repo, index);
    },
    {
      params: t.Object(orgRepoNumberParams),
      detail: { tags: ["PRs"], summary: "Get a pull request" },
    },
  )
  .post(
    "/:org/:repo",
    async ({ params: { org, repo }, body, user, set }) => {
      const client = new ForgejoClient(user.token);
      const pr = await client.createPR(org, repo, {
        title: body.title,
        body: body.body || "",
        head: body.head,
        base: body.base || "main",
      });
      set.status = 201;
      return pr;
    },
    {
      params: t.Object(orgRepoParams),
      body: t.Object({
        title: t.String({ minLength: 1 }),
        head: t.String({ minLength: 1 }),
        body: t.Optional(t.String()),
        base: t.Optional(t.String()),
      }),
      detail: { tags: ["PRs"], summary: "Create a pull request" },
    },
  )
  .post(
    "/:org/:repo/:number/merge",
    async ({ params: { org, repo, number }, body, user, set }) => {
      if (!/^\d+$/.test(number) || parseInt(number) < 1) {
        set.status = 400;
        return { error: "Invalid PR number" };
      }
      const method = body.method || "merge";
      const validMethods = [
        "merge",
        "rebase",
        "rebase-merge",
        "squash",
        "manually-merged",
      ];
      if (!validMethods.includes(method)) {
        set.status = 422;
        return {
          error: `Invalid merge method: "${method}". Valid methods: ${validMethods.join(", ")}`,
        };
      }
      const client = new ForgejoClient(user.token);
      try {
        await client.mergePR(org, repo, parseInt(number), method);
        return { merged: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        // Already merged — Forgejo returns 405 with empty body
        if (message.includes("405")) {
          set.status = 405;
          return {
            error: "Pull request is already merged or cannot be merged",
          };
        }
        // 409 conflict — head has changed or merge conflict
        if (message.includes("409")) {
          set.status = 409;
          return { error: "Merge conflict or pull request head has changed" };
        }
        throw err;
      }
    },
    {
      params: t.Object(orgRepoNumberParams),
      body: t.Object({
        method: t.Optional(t.String()),
      }),
      detail: { tags: ["PRs"], summary: "Merge a pull request" },
    },
  )
  .post(
    "/:org/:repo/:number/approve",
    async ({ params: { org, repo, number }, body, user, set }) => {
      if (!/^\d+$/.test(number) || parseInt(number) < 1) {
        set.status = 400;
        return { error: "Invalid PR number" };
      }
      const client = new ForgejoClient(user.token);
      await client.approvePR(org, repo, parseInt(number), body.body);
      return { approved: true };
    },
    {
      params: t.Object(orgRepoNumberParams),
      body: t.Object({
        body: t.Optional(t.String()),
      }),
      detail: { tags: ["PRs"], summary: "Approve a pull request" },
    },
  )
  .get(
    "/:org/:repo/:number/comments",
    async ({ params: { org, repo, number }, user, set }) => {
      if (!/^\d+$/.test(number) || parseInt(number) < 1) {
        set.status = 400;
        return { error: "Invalid PR number" };
      }
      const client = new ForgejoClient(user.token);
      return client.listPRComments(org, repo, parseInt(number));
    },
    {
      params: t.Object(orgRepoNumberParams),
      detail: { tags: ["PRs"], summary: "List pull request comments" },
    },
  )
  .post(
    "/:org/:repo/:number/comments",
    async ({ params: { org, repo, number }, body, user, set }) => {
      if (!/^\d+$/.test(number) || parseInt(number) < 1) {
        set.status = 400;
        return { error: "Invalid PR number" };
      }
      const client = new ForgejoClient(user.token);
      const comment = await client.commentOnPR(
        org,
        repo,
        parseInt(number),
        body.body,
      );
      set.status = 201;
      return comment;
    },
    {
      params: t.Object(orgRepoNumberParams),
      body: t.Object({
        body: t.String({ minLength: 1 }),
      }),
      detail: { tags: ["PRs"], summary: "Comment on a pull request" },
    },
  );
