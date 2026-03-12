import { Router } from "express";
import { getServiceStatuses, getApps } from "../services/k8s.js";

export const statusRouter = Router();

statusRouter.get("/", async (_req, res) => {
  try {
    const [services, apps] = await Promise.all([
      getServiceStatuses(),
      getApps(),
    ]);
    res.json({
      healthy: services.every((s) => s.ready),
      services,
      apps,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch platform status" });
  }
});
