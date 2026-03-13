import { Router } from "express";
import { WoodpeckerClient } from "../services/woodpecker.js";
import { handleErr } from "./error.js";

export const pipelinesRouter = Router();
const woodpecker = new WoodpeckerClient();

async function getRepoId(org: string, repo: string): Promise<number> {
  const wp = await woodpecker.lookupRepo(`${org}/${repo}`);
  if (!wp) throw new Error(`Woodpecker repo not found 404: ${org}/${repo}`);
  return wp.id;
}

pipelinesRouter.get("/:org/:repo", async (req, res) => {
  try {
    const repoId = await getRepoId(req.params.org, req.params.repo);
    const pipelines = await woodpecker.listPipelines(repoId);
    res.json(pipelines);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

pipelinesRouter.post("/:org/:repo", async (req, res) => {
  try {
    const repoId = await getRepoId(req.params.org, req.params.repo);
    const branch = req.body.branch || "main";
    const pipeline = await woodpecker.triggerPipeline(repoId, branch);
    res.status(201).json(pipeline);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

pipelinesRouter.get("/:org/:repo/:number", async (req, res) => {
  try {
    const repoId = await getRepoId(req.params.org, req.params.repo);
    const pipeline = await woodpecker.getPipeline(
      repoId,
      parseInt(req.params.number),
    );
    res.json(pipeline);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

pipelinesRouter.get("/:org/:repo/:number/logs", async (req, res) => {
  try {
    const repoId = await getRepoId(req.params.org, req.params.repo);
    const step = parseInt((req.query.step as string) || "2");
    const logs = await woodpecker.getPipelineLogs(
      repoId,
      parseInt(req.params.number),
      step,
    );
    res.json({ logs });
  } catch (err: unknown) {
    handleErr(err, res);
  }
});
