import { Elysia, t } from "elysia";
import { randomBytes } from "crypto";
import { requireAdminPlugin } from "../auth.js";
import { ForgejoClient } from "../services/forgejo.js";
import { getServiceStatuses, getApps } from "../services/k8s.js";
import { PlatformConfigService } from "../services/platform-config.js";

const FORGEJO_URL =
  process.env.FORGEJO_INTERNAL_URL || process.env.FORGEJO_URL || "";

export const platformPlugin = new Elysia({ prefix: "/platform" })
  .use(requireAdminPlugin)

  // GET /services — platform service health
  .get(
    "/services",
    async () => {
      const services = await getServiceStatuses();
      return { services };
    },
    {
      detail: { tags: ["Platform"], summary: "List platform service health" },
    },
  )

  // GET /users — list all Forgejo users (admin API)
  .get(
    "/users",
    async ({ user }) => {
      const users: unknown[] = [];
      let page = 1;
      while (true) {
        const resp = await fetch(
          `${FORGEJO_URL}/api/v1/admin/users?limit=50&page=${page}`,
          {
            headers: {
              Authorization: `token ${user.token}`,
              Accept: "application/json",
            },
          },
        );
        if (!resp.ok) {
          const body = await resp.text();
          throw new Error(`Forgejo API ${resp.status}: ${body}`);
        }
        const batch = await resp.json();
        if (!Array.isArray(batch) || batch.length === 0) break;
        users.push(...batch);
        if (batch.length < 50) break;
        page++;
      }
      return { users };
    },
    {
      detail: { tags: ["Platform"], summary: "List Forgejo users" },
    },
  )

  // POST /users — create a Forgejo user
  .post(
    "/users",
    async ({ body, user, set }) => {
      const initialPassword = randomBytes(16).toString("hex");

      const resp = await fetch(`${FORGEJO_URL}/api/v1/admin/users`, {
        method: "POST",
        headers: {
          Authorization: `token ${user.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          username: body.username,
          email: body.email,
          password: body.password || initialPassword,
          must_change_password: true,
        }),
      });
      if (!resp.ok) {
        const respBody = await resp.text();
        throw new Error(`Forgejo API ${resp.status}: ${respBody}`);
      }
      const created = await resp.json();
      set.status = 201;
      return { user: created, initialPassword };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 1 }),
        email: t.String({ minLength: 1 }),
        password: t.Optional(t.String()),
      }),
      detail: { tags: ["Platform"], summary: "Create Forgejo user" },
    },
  )

  // GET /apps — list deployed apps and orgs
  .get(
    "/apps",
    async ({ user }) => {
      const client = new ForgejoClient(user.token);
      const [apps, orgs] = await Promise.all([getApps(), client.listOrgs()]);
      return { apps, orgs };
    },
    {
      detail: { tags: ["Platform"], summary: "List deployed apps and orgs" },
    },
  )

  // POST /apps — create app from system template
  .post(
    "/apps",
    async ({ body, user, set }) => {
      const client = new ForgejoClient(user.token);
      const repo = await client.generateFromTemplate("system", "template", {
        owner: body.org,
        name: body.name,
        description: body.description,
      });
      set.status = 201;
      return { repo };
    },
    {
      body: t.Object({
        org: t.String({ minLength: 1 }),
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
      }),
      detail: { tags: ["Platform"], summary: "Create app from template" },
    },
  )

  // GET /config — read current platform configuration
  .get(
    "/config",
    async ({ user }) => {
      const configService = new PlatformConfigService(user.token);
      const config = await configService.getConfig();
      return { config };
    },
    {
      detail: { tags: ["Platform"], summary: "Read platform configuration" },
    },
  )

  // PATCH /config — update platform configuration
  .patch(
    "/config",
    async ({ body, user }) => {
      const configService = new PlatformConfigService(user.token);
      const result = await configService.updateConfig(body);
      return result;
    },
    {
      body: t.Object({
        tls: t.Optional(
          t.Object({
            mode: t.Optional(
              t.Union([
                t.Literal("selfsigned"),
                t.Literal("letsencrypt"),
                t.Literal("cloudflare"),
              ]),
            ),
          }),
        ),
        network: t.Optional(
          t.Object({
            mode: t.Optional(
              t.Union([t.Literal("host"), t.Literal("loadbalancer")]),
            ),
            traefikIp: t.Optional(t.String()),
            addressPool: t.Optional(t.String()),
            interface: t.Optional(t.String()),
          }),
        ),
        services: t.Optional(
          t.Object({
            jitsi: t.Optional(
              t.Object({
                enabled: t.Optional(t.Boolean()),
              }),
            ),
            zulip: t.Optional(
              t.Object({
                enabled: t.Optional(t.Boolean()),
              }),
            ),
            mailpit: t.Optional(
              t.Object({
                enabled: t.Optional(t.Boolean()),
              }),
            ),
          }),
        ),
      }),
      detail: { tags: ["Platform"], summary: "Update platform configuration" },
    },
  );
