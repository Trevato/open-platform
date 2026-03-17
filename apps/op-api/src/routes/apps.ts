import { Elysia, t } from "elysia";
import { authPlugin } from "../auth.js";
import { getApps, getAppStatus } from "../services/k8s.js";
import { WoodpeckerClient } from "../services/woodpecker.js";

const woodpecker = new WoodpeckerClient();
const repoParams = t.Object({ org: t.String(), repo: t.String() });

export const appsPlugin = new Elysia({ prefix: "/apps" })
  .use(authPlugin)
  .get(
    "/",
    async () => {
      return getApps();
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
  .post(
    "/:org/:repo",
    async ({ params: { org, repo }, body, set }) => {
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
