import express from "express";
import { randomUUID } from "crypto";
import swaggerUi from "swagger-ui-express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { authMiddleware, authenticateRequest } from "./auth.js";
import { createMcpServer } from "./mcp/server.js";
import { statusRouter } from "./routes/status.js";
import { reposRouter } from "./routes/repos.js";
import { prsRouter } from "./routes/prs.js";
import { pipelinesRouter } from "./routes/pipelines.js";
import { appsRouter } from "./routes/apps.js";
import { orgsRouter } from "./routes/orgs.js";
import { usersRouter } from "./routes/users.js";
import { issuesRouter } from "./routes/issues.js";
import { branchesRouter } from "./routes/branches.js";
import { filesRouter } from "./routes/files.js";
import { spec } from "./openapi.js";

const app = express();
app.use(express.json());

// Health check (no auth)
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

// Swagger UI at root
app.use("/", swaggerUi.serve);
app.get("/", swaggerUi.setup(spec, { customSiteTitle: "Open Platform API" }));
app.get("/openapi.json", (_req, res) => res.json(spec));

// REST API routes (all require Bearer token)
app.use("/api/v1", authMiddleware);
app.use("/api/v1/status", statusRouter);
app.use("/api/v1/repos", reposRouter);
app.use("/api/v1/prs", prsRouter);
app.use("/api/v1/pipelines", pipelinesRouter);
app.use("/api/v1/apps", appsRouter);
app.use("/api/v1/orgs", orgsRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/issues", issuesRouter);
app.use("/api/v1/branches", branchesRouter);
app.use("/api/v1/files", filesRouter);

// MCP endpoint — Streamable HTTP with session management
const transports = new Map<
  string,
  { transport: StreamableHTTPServerTransport; createdAt: number }
>();

// Clean up stale sessions every 5 minutes
setInterval(
  () => {
    const maxAge = 30 * 60 * 1000; // 30 minutes
    for (const [id, entry] of transports) {
      if (Date.now() - entry.createdAt > maxAge) {
        entry.transport.close();
        transports.delete(id);
      }
    }
  },
  5 * 60 * 1000,
);

app.post("/mcp", async (req, res) => {
  const user = await authenticateRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    const { transport } = transports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
    return;
  }

  if (!sessionId && isInitializeRequest(req.body)) {
    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
    });
    transports.set(newSessionId, { transport, createdAt: Date.now() });

    const server = createMcpServer(user);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  res.status(400).json({
    error:
      "Invalid request. Send an initialize request without session ID to start.",
  });
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const entry = transports.get(sessionId);
  if (!entry) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  await entry.transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const entry = transports.get(sessionId);
  if (entry) {
    entry.transport.close();
    transports.delete(sessionId);
  }
  res.status(200).end();
});

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, () => {
  console.log(`[op-api] listening on :${PORT}`);
  console.log(`[op-api] REST: http://localhost:${PORT}/api/v1`);
  console.log(`[op-api] MCP:  http://localhost:${PORT}/mcp`);
});
