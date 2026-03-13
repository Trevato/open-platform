import { Router, type Request } from "express";
import { ForgejoClient } from "../services/forgejo.js";
import { handleErr } from "./error.js";

export const branchesRouter = Router();

branchesRouter.get("/:org/:repo", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const branches = await client.listBranches(req.params.org, req.params.repo);
    res.json(branches);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

// Wildcard route to support branch names with slashes (e.g. feat/my-feature)
branchesRouter.delete("/:org/:repo/*", async (req: Request, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const parts = req.path.split("/").filter(Boolean);
    // parts[0] = org, parts[1] = repo, rest = branch name
    const org = parts[0];
    const repo = parts[1];
    const branchName = parts.slice(2).join("/");
    if (!branchName) {
      res.status(400).json({ error: "branch name is required" });
      return;
    }
    const existed = await client.deleteBranch(org, repo, branchName);
    if (!existed) {
      res.status(404).json({ error: "Branch not found" });
      return;
    }
    res.json({ deleted: true });
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

branchesRouter.post("/:org/:repo", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const { name, from } = req.body;
    if (!name?.trim()) {
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
    handleErr(err, res);
  }
});
