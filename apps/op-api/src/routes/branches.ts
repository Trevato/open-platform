import { Router } from "express";
import { ForgejoClient } from "../services/forgejo.js";

export const branchesRouter = Router();

branchesRouter.get("/:org/:repo", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const branches = await client.listBranches(req.params.org, req.params.repo);
    res.json(branches);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

branchesRouter.delete("/:org/:repo/:name", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    await client.deleteBranch(req.params.org, req.params.repo, req.params.name);
    res.json({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

branchesRouter.post("/:org/:repo", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const { name, from } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const branch = await client.createBranch(
      req.params.org,
      req.params.repo,
      name,
      from,
    );
    res.status(201).json(branch);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
