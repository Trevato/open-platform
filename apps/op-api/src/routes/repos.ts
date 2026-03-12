import { Router } from "express";
import { ForgejoClient } from "../services/forgejo.js";

export const reposRouter = Router();

reposRouter.get("/:org", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const repos = await client.listRepos(req.params.org);
    res.json(repos);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(message.includes("404") ? 404 : 500).json({ error: message });
  }
});

reposRouter.get("/:org/:repo", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const repo = await client.getRepo(req.params.org, req.params.repo);
    res.json(repo);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(message.includes("404") ? 404 : 500).json({ error: message });
  }
});

reposRouter.post("/:org/:repo/generate", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const repo = await client.generateFromTemplate(
      req.params.org,
      req.params.repo,
      {
        owner: req.params.org,
        name,
        description,
      },
    );
    res.status(201).json(repo);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
