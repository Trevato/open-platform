import { Router } from "express";
import { ForgejoClient } from "../services/forgejo.js";
import { handleErr } from "./error.js";

export const reposRouter = Router();

reposRouter.get("/:org", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const repos = await client.listRepos(req.params.org);
    res.json(repos);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

reposRouter.get("/:org/:repo", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const repo = await client.getRepo(req.params.org, req.params.repo);
    res.json(repo);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

reposRouter.post("/:org", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const { name, description } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const repo = await client.createRepo(req.params.org, {
      name,
      description,
      private: req.body.private,
      auto_init: req.body.auto_init,
    });
    res.status(201).json(repo);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

reposRouter.delete("/:org/:repo", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const existed = await client.deleteRepo(req.params.org, req.params.repo);
    if (!existed) {
      res.status(404).json({ error: "Repository not found" });
      return;
    }
    res.json({ deleted: true });
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

reposRouter.post("/:org/:repo/generate", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const { name, description, owner } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const repo = await client.generateFromTemplate(
      req.params.org,
      req.params.repo,
      {
        owner: owner || req.params.org,
        name,
        description,
      },
    );
    res.status(201).json(repo);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});
