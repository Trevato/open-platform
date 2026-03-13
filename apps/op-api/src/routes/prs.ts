import { Router } from "express";
import { ForgejoClient } from "../services/forgejo.js";

export const prsRouter = Router();

prsRouter.get("/:org/:repo", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const state = (req.query.state as string) || "open";
    const prs = await client.listPRs(req.params.org, req.params.repo, state);
    res.json(prs);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

prsRouter.post("/:org/:repo", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const { title, body, head, base } = req.body;
    if (!title || !head) {
      res.status(400).json({ error: "title and head are required" });
      return;
    }
    const pr = await client.createPR(req.params.org, req.params.repo, {
      title,
      body: body || "",
      head,
      base: base || "main",
    });
    res.status(201).json(pr);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

prsRouter.post("/:org/:repo/:number/merge", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const method = req.body.method || "merge";
    await client.mergePR(
      req.params.org,
      req.params.repo,
      parseInt(req.params.number),
      method,
    );
    res.json({ merged: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

prsRouter.post("/:org/:repo/:number/approve", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    await client.approvePR(
      req.params.org,
      req.params.repo,
      parseInt(req.params.number),
      req.body.body,
    );
    res.json({ approved: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

prsRouter.get("/:org/:repo/:number/comments", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const comments = await client.listPRComments(
      req.params.org,
      req.params.repo,
      parseInt(req.params.number),
    );
    res.json(comments);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

prsRouter.post("/:org/:repo/:number/comments", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const { body } = req.body;
    if (!body) {
      res.status(400).json({ error: "body is required" });
      return;
    }
    const comment = await client.commentOnPR(
      req.params.org,
      req.params.repo,
      parseInt(req.params.number),
      body,
    );
    res.status(201).json(comment);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
