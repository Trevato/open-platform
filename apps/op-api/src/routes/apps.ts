import { Elysia, t } from "elysia";
import { authPlugin } from "../auth.js";
import {
  getWorkloadApps,
  getAppStatus,
  getPreviewStatus,
  listPreviews,
} from "../services/k8s.js";
import { WoodpeckerClient } from "../services/woodpecker.js";
import { ForgejoClient } from "../services/forgejo.js";

const woodpecker = new WoodpeckerClient();
const repoParams = t.Object({ org: t.String(), repo: t.String() });

export const appsPlugin = new Elysia({ prefix: "/apps" })
  .use(authPlugin)
  .get(
    "/",
    async () => {
      return getWorkloadApps();
    },
    {
      detail: { tags: ["Apps"], summary: "List deployed apps" },
    },
  )
  .get(
    "/:org/:repo",
    async ({ params: { org, repo }, set }) => {
      const app = await getAppStatus(org, repo);
      if (!app) {
        set.status = 404;
        return { error: "App not found" };
      }
      return app;
    },
    {
      params: repoParams,
      detail: { tags: ["Apps"], summary: "Get app status" },
    },
  )
  .get(
    "/:org/:repo/previews",
    async ({ params: { org, repo } }) => {
      return listPreviews(org, repo);
    },
    {
      params: repoParams,
      detail: { tags: ["Apps"], summary: "List preview environments" },
    },
  )
  .get(
    "/:org/:repo/previews/:pr",
    async ({ params: { org, repo, pr }, set }) => {
      const preview = await getPreviewStatus(org, repo, parseInt(pr, 10));
      if (!preview) {
        set.status = 404;
        return { error: "Preview not found" };
      }
      return preview;
    },
    {
      params: t.Object({ org: t.String(), repo: t.String(), pr: t.String() }),
      detail: { tags: ["Apps"], summary: "Get preview environment status" },
    },
  )
  .post(
    "/:org/:repo",
    async ({ params: { org, repo }, body, user, set }) => {
      // Verify the user has write access to the repo before triggering deploy
      const client = new ForgejoClient(user.token);
      const repoInfo = await client.getRepo(org, repo).catch(() => null);
      if (!repoInfo || !repoInfo.permissions?.push) {
        set.status = 403;
        return { error: "You do not have push access to this repository" };
      }

      const wp = await woodpecker.lookupRepo(`${org}/${repo}`);
      if (!wp) {
        set.status = 404;
        return { error: "Repo not found in Woodpecker" };
      }
      const pipeline = await woodpecker.triggerPipeline(
        wp.id,
        body.branch || "main",
      );
      set.status = 201;
      return pipeline;
    },
    {
      params: repoParams,
      body: t.Object({
        branch: t.Optional(t.String()),
      }),
      detail: { tags: ["Apps"], summary: "Deploy app (trigger pipeline)" },
    },
  );
