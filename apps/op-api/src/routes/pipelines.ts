import { Elysia, t } from "elysia";
import { authPlugin } from "../auth.js";
import { WoodpeckerClient } from "../services/woodpecker.js";
import { ForgejoClient } from "../services/forgejo.js";

const woodpecker = new WoodpeckerClient();
const repoParams = t.Object({ org: t.String(), repo: t.String() });
const pipelineParams = t.Object({
  org: t.String(),
  repo: t.String(),
  number: t.String(),
});

async function getRepoId(org: string, repo: string): Promise<number> {
  const wp = await woodpecker.lookupRepo(`${org}/${repo}`);
  if (!wp) throw new Error(`CI repository not found: ${org}/${repo}`);
  return wp.id;
}

/** Verify the user has at least read access to the repo via Forgejo. */
async function verifyRepoAccess(
  token: string,
  org: string,
  repo: string,
): Promise<void> {
  const client = new ForgejoClient(token);
  await client.getRepo(org, repo); // throws on 403/404
}

/** Parse and validate a pipeline number param. Returns the integer or a 400 error response. */
function parsePipelineNumber(
  number: string,
  set: { status?: number | string },
): number | { error: string } {
  if (!/^\d+$/.test(number)) {
    set.status = 400;
    return { error: `Invalid pipeline number: ${number}` };
  }
  const parsed = parseInt(number);
  if (parsed < 1) {
    set.status = 400;
    return { error: `Invalid pipeline number: ${number}` };
  }
  return parsed;
}

export const pipelinesPlugin = new Elysia({ prefix: "/pipelines" })
  .use(authPlugin)
  .get(
    "/:org/:repo",
    async ({ params: { org, repo }, user }) => {
      await verifyRepoAccess(user.token, org, repo);
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
    async ({ params: { org, repo }, body, user, set }) => {
      await verifyRepoAccess(user.token, org, repo);
      const repoId = await getRepoId(org, repo);
      const branch = body.branch || "main";
      try {
        const pipeline = await woodpecker.triggerPipeline(repoId, branch);
        set.status = 201;
        return pipeline;
      } catch (err) {
        // Woodpecker returns 500 for nonexistent branches — surface as 422
        const message =
          err instanceof Error ? err.message : "Pipeline trigger failed";
        if (message.includes("500")) {
          set.status = 422;
          return {
            error: `Failed to trigger pipeline: branch "${branch}" may not exist`,
          };
        }
        throw err;
      }
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
    async ({ params: { org, repo, number }, user, set }) => {
      const parsed = parsePipelineNumber(number, set);
      if (typeof parsed !== "number") return parsed;
      await verifyRepoAccess(user.token, org, repo);
      const repoId = await getRepoId(org, repo);
      return woodpecker.getPipeline(repoId, parsed);
    },
    {
      params: pipelineParams,
      detail: { tags: ["Pipelines"], summary: "Get pipeline" },
    },
  )
  .get(
    "/:org/:repo/:number/logs",
    async ({ params: { org, repo, number }, query, user, set }) => {
      const parsedNumber = parsePipelineNumber(number, set);
      if (typeof parsedNumber !== "number") return parsedNumber;
      await verifyRepoAccess(user.token, org, repo);

      // Validate step query param
      let step = 2;
      if (query.step) {
        if (!/^\d+$/.test(query.step)) {
          set.status = 400;
          return { error: `Invalid step number: ${query.step}` };
        }
        step = parseInt(query.step);
        if (step < 1) {
          set.status = 400;
          return { error: `Invalid step number: ${query.step}` };
        }
      }

      const repoId = await getRepoId(org, repo);
      try {
        const logs = await woodpecker.getPipelineLogs(
          repoId,
          parsedNumber,
          step,
        );
        return { logs };
      } catch (err) {
        // Step not found in pipeline — return 404 not 500
        const message = err instanceof Error ? err.message : "";
        if (message.includes("not found in pipeline")) {
          set.status = 404;
          return {
            error: `Step ${step} not found in pipeline ${parsedNumber}`,
          };
        }
        throw err;
      }
    },
    {
      params: pipelineParams,
      query: t.Object({
        step: t.Optional(t.String()),
      }),
      detail: { tags: ["Pipelines"], summary: "Get pipeline logs" },
    },
  );
