import { Router } from "express";
import { ForgejoClient } from "../services/forgejo.js";
import { handleErr } from "./error.js";

export const issuesRouter = Router();

// ── Issues ──────────────────────────────────────────────────────────

issuesRouter.get("/:org/:repo", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const issues = await client.listIssues(req.params.org, req.params.repo, {
      state: (req.query.state as string) || undefined,
      labels: (req.query.labels as string) || undefined,
      milestone: (req.query.milestone as string) || undefined,
      assignee: (req.query.assignee as string) || undefined,
    });
    res.json(issues);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

issuesRouter.post("/:org/:repo", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const { title, body, labels, milestone, assignees } = req.body;
    if (!title?.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const issue = await client.createIssue(req.params.org, req.params.repo, {
      title,
      body,
      labels,
      milestone,
      assignees,
    });
    res.status(201).json(issue);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

issuesRouter.patch("/:org/:repo/:number", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const { title, body, state, labels, milestone, assignees } = req.body;
    const issue = await client.updateIssue(
      req.params.org,
      req.params.repo,
      parseInt(req.params.number),
      { title, body, state, labels, milestone, assignees },
    );
    res.json(issue);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

issuesRouter.post("/:org/:repo/:number/comments", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const { body } = req.body;
    if (!body?.trim()) {
      res.status(400).json({ error: "body is required" });
      return;
    }
    const comment = await client.commentOnIssue(
      req.params.org,
      req.params.repo,
      parseInt(req.params.number),
      body,
    );
    res.status(201).json(comment);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

// ── Labels ──────────────────────────────────────────────────────────

issuesRouter.get("/:org/:repo/labels", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const labels = await client.listLabels(req.params.org, req.params.repo);
    res.json(labels);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

issuesRouter.post("/:org/:repo/labels", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const { name, color, description } = req.body;
    if (!name || !color) {
      res.status(400).json({ error: "name and color are required" });
      return;
    }
    const label = await client.createLabel(req.params.org, req.params.repo, {
      name,
      color,
      description,
    });
    res.status(201).json(label);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

// ── Milestones ──────────────────────────────────────────────────────

issuesRouter.get("/:org/:repo/milestones", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const milestones = await client.listMilestones(
      req.params.org,
      req.params.repo,
      (req.query.state as string) || undefined,
    );
    res.json(milestones);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

issuesRouter.post("/:org/:repo/milestones", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const { title, description, due_on } = req.body;
    if (!title?.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    // Coerce date-only strings to full ISO datetime (Forgejo requires it)
    const normalizedDueOn =
      due_on && !due_on.includes("T") ? `${due_on}T00:00:00Z` : due_on;
    const milestone = await client.createMilestone(
      req.params.org,
      req.params.repo,
      { title, description, due_on: normalizedDueOn },
    );
    res.status(201).json(milestone);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});
