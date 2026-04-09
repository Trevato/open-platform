import { Elysia, t } from "elysia";
import { authPlugin, requireAdminPlugin } from "../auth.js";
import { ForgejoClient } from "../services/forgejo.js";
import pool from "../services/db.js";
import { WoodpeckerClient } from "../services/woodpecker.js";

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || "";
const EXTRA_DOMAINS = process.env.EXTRA_DOMAINS || "";

function getAvailableDomains(): string[] {
  const domains = [PLATFORM_DOMAIN];
  if (EXTRA_DOMAINS) {
    for (const d of EXTRA_DOMAINS.split(",")) {
      const trimmed = d.trim();
      if (trimmed && !domains.includes(trimmed)) domains.push(trimmed);
    }
  }
  return domains;
}

export const orgsPlugin = new Elysia({ prefix: "/orgs" })
  .use(authPlugin)
  .get(
    "/",
    async ({ user }) => {
      const client = new ForgejoClient(user.token);
      return client.listOrgs();
    },
    {
      detail: { tags: ["Orgs"], summary: "List orgs" },
    },
  )
  .post(
    "/",
    async ({ body, user, set }) => {
      if (!user.isAdmin) {
        set.status = 403;
        return { error: "Admin access required" };
      }
      const client = new ForgejoClient(user.token);
      const org = await client.createOrg(body.name, {
        description: body.description,
      });
      set.status = 201;
      return org;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
      }),
      detail: { tags: ["Orgs"], summary: "Create org (admin only)" },
    },
  )
  .get(
    "/domains",
    () => {
      return { domains: getAvailableDomains(), primary: PLATFORM_DOMAIN };
    },
    {
      detail: { tags: ["Orgs"], summary: "List available domains" },
    },
  )
  .get(
    "/:name/domain",
    async ({ params }) => {
      const { rows } = await pool.query(
        "SELECT domain FROM org_domains WHERE org_name = $1",
        [params.name],
      );
      return {
        org: params.name,
        domain: rows.length > 0 ? rows[0].domain : PLATFORM_DOMAIN,
        isCustom: rows.length > 0,
      };
    },
    {
      params: t.Object({ name: t.String() }),
      detail: { tags: ["Orgs"], summary: "Get domain for an org" },
    },
  )
  .use(requireAdminPlugin)
  .put(
    "/:name/domain",
    async ({ params, body, set }) => {
      const available = getAvailableDomains();
      if (!available.includes(body.domain)) {
        set.status = 400;
        return {
          error: `Domain not available. Must be one of: ${available.join(", ")}`,
        };
      }

      if (!body.domain || body.domain === PLATFORM_DOMAIN) {
        await pool.query("DELETE FROM org_domains WHERE org_name = $1", [
          params.name,
        ]);
      } else {
        await pool.query(
          `INSERT INTO org_domains (org_name, domain, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (org_name) DO UPDATE SET domain = $2, updated_at = NOW()`,
          [params.name, body.domain],
        );
      }

      // Sync all org secrets (domain change affects registry_host too)
      const woodpecker = new WoodpeckerClient();
      await woodpecker.ensureOrgSecrets(
        params.name,
        body.domain || PLATFORM_DOMAIN,
      );

      return {
        org: params.name,
        domain: body.domain || PLATFORM_DOMAIN,
        isCustom: body.domain !== PLATFORM_DOMAIN && !!body.domain,
      };
    },
    {
      params: t.Object({ name: t.String() }),
      body: t.Object({
        domain: t.String({ minLength: 1 }),
      }),
      detail: { tags: ["Orgs"], summary: "Assign domain to org (admin only)" },
    },
  );
