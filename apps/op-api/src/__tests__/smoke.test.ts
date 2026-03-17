import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { authPlugin } from "../auth.js";
import { statusPlugin } from "../routes/status.js";
import { usersPlugin } from "../routes/users.js";
import { reposPlugin } from "../routes/repos.js";
import { orgsPlugin } from "../routes/orgs.js";
import { prsPlugin } from "../routes/prs.js";
import { branchesPlugin } from "../routes/branches.js";
import { filesPlugin } from "../routes/files.js";
import { issuesPlugin } from "../routes/issues.js";
import { appsPlugin } from "../routes/apps.js";
import { pipelinesPlugin } from "../routes/pipelines.js";

describe("smoke: all routes reject unauthenticated requests", () => {
  const app = new Elysia().group("/api/v1", (app) =>
    app
      .use(statusPlugin)
      .use(usersPlugin)
      .use(reposPlugin)
      .use(orgsPlugin)
      .use(prsPlugin)
      .use(branchesPlugin)
      .use(filesPlugin)
      .use(issuesPlugin)
      .use(appsPlugin)
      .use(pipelinesPlugin),
  );

  const routes = [
    "/api/v1/status",
    "/api/v1/users/me",
    "/api/v1/repos/system",
    "/api/v1/orgs",
    "/api/v1/prs/system/template",
    "/api/v1/branches/system/template",
    "/api/v1/files/system/template/README.md",
    "/api/v1/issues/system/template",
    "/api/v1/apps",
    "/api/v1/pipelines/system/template",
  ];

  for (const path of routes) {
    test(`GET ${path} → 401`, async () => {
      const res = await app.handle(new Request(`http://localhost${path}`));
      expect(res.status).toBe(401);
    });
  }
});

describe("healthz (no auth required)", () => {
  const app = new Elysia().get("/healthz", () => ({ status: "ok" }));

  test("GET /healthz → 200", async () => {
    const res = await app.handle(new Request("http://localhost/healthz"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
