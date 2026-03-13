import { Router, type Request } from "express";
import { ForgejoClient } from "../services/forgejo.js";
import { handleErr } from "./error.js";

export const filesRouter = Router();

function extractFilePath(req: Request): string {
  // Route is /:org/:repo/*, extract everything after org/repo
  const fullPath = req.path;
  const parts = fullPath.split("/").filter(Boolean);
  // parts[0] = org, parts[1] = repo, rest = file path
  return parts.slice(2).join("/");
}

// GET /:org/:repo/* — read file content (decoded)
filesRouter.get("/:org/:repo/*", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const filePath = extractFilePath(req);
    if (!filePath) {
      res.status(400).json({ error: "file path is required" });
      return;
    }
    const ref = (req.query.ref as string) || undefined;
    const content = await client.getFileContent(
      req.params.org,
      req.params.repo,
      filePath,
      ref,
    );
    // Decode base64 content for convenience
    const decoded =
      content.encoding === "base64"
        ? Buffer.from(content.content, "base64").toString("utf-8")
        : content.content;
    res.json({
      name: content.name,
      path: content.path,
      sha: content.sha,
      size: content.size,
      content: decoded,
    });
  } catch (err: unknown) {
    handleErr(err, res);
  }
});

// PUT /:org/:repo/* — create or update file
filesRouter.put("/:org/:repo/*", async (req, res) => {
  try {
    const client = new ForgejoClient(req.user!.token);
    const filePath = extractFilePath(req);
    if (!filePath) {
      res.status(400).json({ error: "file path is required" });
      return;
    }
    const { content, message, branch, sha } = req.body;
    if (!content || !message) {
      res.status(400).json({ error: "content and message are required" });
      return;
    }
    const result = await client.createOrUpdateFile(
      req.params.org,
      req.params.repo,
      filePath,
      { content, message, branch, sha },
    );
    res.status(201).json(result);
  } catch (err: unknown) {
    handleErr(err, res);
  }
});
