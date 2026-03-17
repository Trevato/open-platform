import { Elysia, t } from "elysia";
import { authPlugin } from "../auth.js";
import { WoodpeckerClient } from "../services/woodpecker.js";

const woodpecker = new WoodpeckerClient();
const repoParams = t.Object({ org: t.String(), repo: t.String() });
const pipelineParams = t.Object({
  org: t.String(),
  repo: t.String(),
  number: t.String(),
});

async function getRepoId(org: string, repo: string): Promise<number> {
  const wp = await woodpecker.lookupRepo(`${org}/${repo}`);
  if (!wp) throw new Error(`Woodpecker repo not found 404: ${org}/${repo}`);
  return wp.id;
}

export const pipelinesPlugin = new Elysia({ prefix: "/pipelines" })
  .use(authPlugin)
  .get(
    "/:org/:repo",
    async ({ params: { org, repo } }) => {
      const repoId = await getRepoId(org, repo);
      return woodpecker.listPipelines(repoId);
    },
    {
      params: repoParams,
      detail: { tags: ["Pipelines"], summary: "List pipelines" },
    },
  )
  .post(
    "/:org/:repo",
    async ({ params: { org, repo }, body, set }) => {
      const repoId = await getRepoId(org, repo);
      const pipeline = await woodpecker.triggerPipeline(
        repoId,
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
      detail: { tags: ["Pipelines"], summary: "Trigger pipeline" },
    },
  )
  .get(
    "/:org/:repo/:number",
    async ({ params: { org, repo, number } }) => {
      const repoId = await getRepoId(org, repo);
      return woodpecker.getPipeline(repoId, parseInt(number));
    },
    {
      params: pipelineParams,
      detail: { tags: ["Pipelines"], summary: "Get pipeline" },
    },
  )
  .get(
    "/:org/:repo/:number/logs",
    async ({ params: { org, repo, number }, query }) => {
      const repoId = await getRepoId(org, repo);
      const step = query.step ? parseInt(query.step) : 2;
      const logs = await woodpecker.getPipelineLogs(
        repoId,
        parseInt(number),
        step,
      );
      return { logs };
    },
    {
      params: pipelineParams,
      query: t.Object({
        step: t.Optional(t.String()),
      }),
      detail: { tags: ["Pipelines"], summary: "Get pipeline logs" },
    },
  );
