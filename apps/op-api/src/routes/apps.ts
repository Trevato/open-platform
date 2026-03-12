import { Router } from "express";
import { getApps, getAppStatus } from "../services/k8s.js";
import { WoodpeckerClient } from "../services/woodpecker.js";

export const appsRouter = Router();
const woodpecker = new WoodpeckerClient();

appsRouter.get("/", async (_req, res) => {
  try {
    const apps = await getApps();
    res.json(apps);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

appsRouter.get("/:org/:repo", async (req, res) => {
  try {
    const app = await getAppStatus(req.params.org, req.params.repo);
    if (!app) {
      res.status(404).json({ error: "App not found" });
      return;
    }
    res.json(app);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

appsRouter.post("/:org/:repo", async (req, res) => {
  try {
    const wp = await woodpecker.lookupRepo(
      `${req.params.org}/${req.params.repo}`,
    );
    if (!wp) {
      res.status(404).json({ error: "Repo not found in Woodpecker" });
      return;
    }
    const branch = req.body.branch || "main";
    const pipeline = await woodpecker.triggerPipeline(wp.id, branch);
    res.status(201).json(pipeline);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
