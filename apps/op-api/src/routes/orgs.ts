import { Router } from "express";
import { ForgejoClient } from "../services/forgejo.js";

export const orgsRouter = Router();

orgsRouter.get("/", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const orgs = await client.listOrgs();
    res.json(orgs);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

orgsRouter.post("/", async (req, res) => {
  try {
    if (!req.user!.isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    const client = new ForgejoClient(req.user!.token);
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const org = await client.createOrg(name, { description });
    res.status(201).json(org);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
