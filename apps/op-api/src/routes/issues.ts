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

export const issuesPlugin = new Elysia({ prefix: "/issues" })
  .use(authPlugin)

  // ── Issues ──────────────────────────────────────────────────────────

  .get(
    "/:org/:repo",
    async ({ params: { org, repo }, query, user }) => {
      const client = new ForgejoClient(user.token);
      return client.listIssues(org, repo, {
        state: query.state || undefined,
        labels: query.labels || undefined,
        milestone: query.milestone || undefined,
        assignee: query.assignee || undefined,
      });
    },
    {
      params: t.Object(orgRepoParams),
      query: t.Object({
        state: t.Optional(t.String()),
        labels: t.Optional(t.String()),
        milestone: t.Optional(t.String()),
        assignee: t.Optional(t.String()),
      }),
      detail: { tags: ["Issues"], summary: "List issues" },
    },
  )
  .get(
    "/:org/:repo/:number",
    async ({ params: { org, repo, number }, user, set }) => {
      const index = parseInt(number);
      if (isNaN(index) || index < 1) {
        set.status = 400;
        return { error: "Invalid issue number" };
      }
      const client = new ForgejoClient(user.token);
      return client.getIssue(org, repo, index);
    },
    {
      params: t.Object(orgRepoNumberParams),
      detail: { tags: ["Issues"], summary: "Get an issue" },
    },
  )
  .post(
    "/:org/:repo",
    async ({ params: { org, repo }, body, user, set }) => {
      const client = new ForgejoClient(user.token);
      const issue = await client.createIssue(org, repo, {
        title: body.title,
        body: body.body,
        labels: body.labels,
        milestone: body.milestone,
        assignees: body.assignees,
      });
      set.status = 201;
      return issue;
    },
    {
      params: t.Object(orgRepoParams),
      body: t.Object({
        title: t.String({ minLength: 1 }),
        body: t.Optional(t.String()),
        labels: t.Optional(t.Array(t.Number())),
        milestone: t.Optional(t.Number()),
        assignees: t.Optional(t.Array(t.String())),
      }),
      detail: { tags: ["Issues"], summary: "Create an issue" },
    },
  )
  .patch(
    "/:org/:repo/:number",
    async ({ params: { org, repo, number }, body, user }) => {
      const client = new ForgejoClient(user.token);
      return client.updateIssue(org, repo, parseInt(number), {
        title: body.title,
        body: body.body,
        state: body.state,
        labels: body.labels,
        milestone: body.milestone,
        assignees: body.assignees,
      });
    },
    {
      params: t.Object(orgRepoNumberParams),
      body: t.Object({
        title: t.Optional(t.String()),
        body: t.Optional(t.String()),
        state: t.Optional(t.String()),
        labels: t.Optional(t.Array(t.Number())),
        milestone: t.Optional(t.Number()),
        assignees: t.Optional(t.Array(t.String())),
      }),
      detail: { tags: ["Issues"], summary: "Update an issue" },
    },
  )
  .post(
    "/:org/:repo/:number/comments",
    async ({ params: { org, repo, number }, body, user, set }) => {
      const client = new ForgejoClient(user.token);
      const comment = await client.commentOnIssue(
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
      detail: { tags: ["Issues"], summary: "Comment on an issue" },
    },
  )

  // ── Labels ──────────────────────────────────────────────────────────

  .get(
    "/:org/:repo/labels",
    async ({ params: { org, repo }, user }) => {
      const client = new ForgejoClient(user.token);
      return client.listLabels(org, repo);
    },
    {
      params: t.Object(orgRepoParams),
      detail: { tags: ["Issues"], summary: "List labels" },
    },
  )
  .post(
    "/:org/:repo/labels",
    async ({ params: { org, repo }, body, user, set }) => {
      const client = new ForgejoClient(user.token);
      const label = await client.createLabel(org, repo, {
        name: body.name,
        color: body.color,
        description: body.description,
      });
      set.status = 201;
      return label;
    },
    {
      params: t.Object(orgRepoParams),
      body: t.Object({
        name: t.String({ minLength: 1 }),
        color: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
      }),
      detail: { tags: ["Issues"], summary: "Create a label" },
    },
  )

  // ── Milestones ──────────────────────────────────────────────────────

  .get(
    "/:org/:repo/milestones",
    async ({ params: { org, repo }, query, user }) => {
      const client = new ForgejoClient(user.token);
      return client.listMilestones(org, repo, query.state || undefined);
    },
    {
      params: t.Object(orgRepoParams),
      query: t.Object({
        state: t.Optional(t.String()),
      }),
      detail: { tags: ["Issues"], summary: "List milestones" },
    },
  )
  .post(
    "/:org/:repo/milestones",
    async ({ params: { org, repo }, body, user, set }) => {
      // Validate and coerce date-only strings to full ISO datetime (Forgejo requires it)
      let normalizedDueOn = body.due_on;
      if (normalizedDueOn) {
        if (!normalizedDueOn.includes("T")) {
          normalizedDueOn = `${normalizedDueOn}T00:00:00Z`;
        }
        // Validate the date is actually parseable
        const parsed = new Date(normalizedDueOn);
        if (isNaN(parsed.getTime())) {
          set.status = 400;
          return {
            error: `Invalid date format for due_on: "${body.due_on}". Use YYYY-MM-DD or ISO 8601.`,
          };
        }
      }
      const client = new ForgejoClient(user.token);
      const milestone = await client.createMilestone(org, repo, {
        title: body.title,
        description: body.description,
        due_on: normalizedDueOn,
      });
      set.status = 201;
      return milestone;
    },
    {
      params: t.Object(orgRepoParams),
      body: t.Object({
        title: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        due_on: t.Optional(t.String()),
      }),
      detail: { tags: ["Issues"], summary: "Create a milestone" },
    },
  );
