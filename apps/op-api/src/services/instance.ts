import { randomBytes } from "crypto";
import pool from "./db.js";
import type { AuthenticatedUser } from "../auth.js";
import { isSystemOrgMember } from "../auth.js";

// ─── Types ───

export interface Instance {
  id: number;
  customer_id: number;
  slug: string;
  display_name: string;
  tier: string;
  status: string;
  admin_email: string;
  admin_username: string;
  admin_password: string | null;
  kubeconfig: string | null;
  cluster_ip: string | null;
  password_reset_at: string | null;
  created_at: string;
  updated_at: string;
  owner_email?: string;
  owner_name?: string;
}

export interface ProvisionEvent {
  phase: string;
  status: string;
  message: string;
  created_at: string;
}

export interface InstanceAccess {
  instance: Instance;
  isAdmin: boolean;
}

const TIER_LIMITS: Record<string, number> = { free: 1, pro: 3, team: 10 };

const RESERVED_SLUGS = [
  "admin",
  "api",
  "www",
  "app",
  "console",
  "system",
  "ops",
  "staging",
  "prod",
];

// ─── Helpers ───

async function resolveIsAdmin(user: AuthenticatedUser): Promise<boolean> {
  return user.isAdmin || (await isSystemOrgMember(user.token, user.login));
}

/**
 * Resolve or auto-create a customer record from Forgejo user info.
 *
 * Lookup order:
 *  1. Direct match on customers.github_username (covers API-created users)
 *  2. Join through better-auth "user" table (covers console-login users)
 *  3. Auto-create a new customer from Forgejo profile
 */
async function getOrCreateCustomer(
  user: AuthenticatedUser,
  client?: import("pg").PoolClient,
): Promise<{ id: number; tier: string; [key: string]: unknown }> {
  const q = client ?? pool;

  // 1. Direct lookup by Forgejo login
  let result = await q.query(
    `SELECT * FROM customers WHERE github_username = $1`,
    [user.login],
  );
  if (result.rows.length > 0) return result.rows[0];

  // 2. Backwards-compat: join through better-auth user table
  result = await q.query(
    `SELECT c.* FROM customers c
     JOIN "user" u ON u.id = c.user_id
     WHERE u.name = $1`,
    [user.login],
  );
  if (result.rows.length > 0) return result.rows[0];

  // 3. Auto-create from Forgejo profile
  result = await q.query(
    `INSERT INTO customers (email, name, github_username)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [user.email, user.login, user.login],
  );
  return result.rows[0];
}

/**
 * Find a customer ID for a Forgejo login (read-only, no auto-create).
 * Returns the customer_id or null if no match exists.
 */
async function findCustomerId(login: string): Promise<number | null> {
  // 1. Direct lookup by Forgejo login
  let result = await pool.query(
    `SELECT id FROM customers WHERE github_username = $1`,
    [login],
  );
  if (result.rows.length > 0) return result.rows[0].id;

  // 2. Backwards-compat: join through better-auth user table
  result = await pool.query(
    `SELECT c.id FROM customers c
     JOIN "user" u ON u.id = c.user_id
     WHERE u.name = $1`,
    [login],
  );
  if (result.rows.length > 0) return result.rows[0].id;

  return null;
}

// ─── Access Control ───

export async function getInstanceAccess(
  slug: string,
  user: AuthenticatedUser,
): Promise<InstanceAccess | null> {
  const isAdmin = await resolveIsAdmin(user);

  if (isAdmin) {
    const result = await pool.query(
      `SELECT i.*, c.email as owner_email, c.name as owner_name
       FROM instances i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.slug = $1`,
      [slug],
    );
    if (result.rows.length === 0) return null;
    return { instance: result.rows[0], isAdmin: true };
  }

  // Non-admin: find customer by Forgejo login, then match instance
  const customerId = await findCustomerId(user.login);
  if (!customerId) return null;

  const result = await pool.query(
    `SELECT i.*
     FROM instances i
     WHERE i.slug = $1 AND i.customer_id = $2`,
    [slug, customerId],
  );
  if (result.rows.length === 0) return null;
  return { instance: result.rows[0], isAdmin: false };
}

// ─── List ───

export async function listInstances(
  user: AuthenticatedUser,
  all: boolean,
): Promise<Instance[]> {
  const isAdmin = await resolveIsAdmin(user);

  if (all && isAdmin) {
    const result = await pool.query(
      `SELECT i.*,
         c.name as owner_name, c.email as owner_email,
         (SELECT json_agg(e ORDER BY e.created_at DESC)
          FROM (
            SELECT phase, status, message, created_at
            FROM provision_events
            WHERE instance_id = i.id
            ORDER BY created_at DESC
            LIMIT 10
          ) e
         ) as recent_events
       FROM instances i
       JOIN customers c ON c.id = i.customer_id
       ORDER BY i.created_at DESC`,
    );
    return result.rows;
  }

  // User-scoped: find customer by Forgejo login
  const customerId = await findCustomerId(user.login);
  if (!customerId) return [];

  const result = await pool.query(
    `SELECT i.*,
       (SELECT json_agg(e ORDER BY e.created_at DESC)
        FROM (
          SELECT phase, status, message, created_at
          FROM provision_events
          WHERE instance_id = i.id
          ORDER BY created_at DESC
          LIMIT 10
        ) e
       ) as recent_events
     FROM instances i
     WHERE i.customer_id = $1
     ORDER BY i.created_at DESC`,
    [customerId],
  );
  return result.rows;
}

// ─── Create ───

export interface CreateInstanceInput {
  slug: string;
  display_name: string;
  admin_email: string;
  tier?: string;
}

export async function createInstance(
  user: AuthenticatedUser,
  data: CreateInstanceInput,
): Promise<{ instance: Instance } | { error: string; status: number }> {
  const { slug, display_name, admin_email, tier: requestedTier } = data;

  // Validate slug
  if (!slug || !/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) {
    return {
      error:
        "Slug must be 3-32 characters, lowercase letters, numbers, and hyphens. Must start with a letter.",
      status: 400,
    };
  }

  if (RESERVED_SLUGS.includes(slug)) {
    return { error: "This name is reserved", status: 400 };
  }

  if (!display_name || display_name.length < 2 || display_name.length > 64) {
    return { error: "Display name must be 2-64 characters", status: 400 };
  }

  if (!admin_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin_email)) {
    return { error: "Valid email required", status: 400 };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Resolve or auto-create customer from Forgejo user info
    const cust = await getOrCreateCustomer(user, client);
    const isAdmin = await resolveIsAdmin(user);

    // Enforce tier limits (admins bypass)
    if (!isAdmin) {
      const count = await client.query(
        `SELECT COUNT(*) FROM instances
         WHERE customer_id = $1 AND status NOT IN ('terminated', 'failed')`,
        [cust.id],
      );

      const limit = TIER_LIMITS[cust.tier] || 1;
      if (parseInt(count.rows[0].count) >= limit) {
        await client.query("ROLLBACK");
        return {
          error: `Instance limit reached (${limit} for ${cust.tier} tier). Upgrade for more.`,
          status: 403,
        };
      }
    }

    // Check slug uniqueness
    const existing = await client.query(
      `SELECT id FROM instances WHERE slug = $1`,
      [slug],
    );

    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return { error: "This name is already taken", status: 409 };
    }

    // Validate tier
    const validTiers = ["free", "pro", "team"];
    const tier = requestedTier || "free";
    if (!validTiers.includes(tier)) {
      await client.query("ROLLBACK");
      return {
        error: `Invalid tier: "${requestedTier}". Valid tiers: ${validTiers.join(", ")}`,
        status: 400,
      };
    }

    // Non-admins cannot request a tier higher than their customer tier
    const tierRank: Record<string, number> = { free: 0, pro: 1, team: 2 };
    if (!isAdmin && tierRank[tier] > (tierRank[cust.tier] ?? 0)) {
      await client.query("ROLLBACK");
      return {
        error: `Your plan (${cust.tier}) does not allow ${tier}-tier instances. Upgrade for higher tiers.`,
        status: 403,
      };
    }

    const instance = await client.query(
      `INSERT INTO instances (customer_id, slug, display_name, tier, admin_email, admin_username)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [cust.id, slug, display_name, tier, admin_email, "opadmin"],
    );

    // Log initial provision event
    await client.query(
      `INSERT INTO provision_events (instance_id, phase, status, message)
       VALUES ($1, 'queued', 'info', 'Instance queued for provisioning')`,
      [instance.rows[0].id],
    );

    await client.query("COMMIT");
    return { instance: instance.rows[0] };
  } catch (err: unknown) {
    await client.query("ROLLBACK");
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    ) {
      return { error: "This name is already taken", status: 409 };
    }
    throw err;
  } finally {
    client.release();
  }
}

// ─── Delete ───

export async function deleteInstance(
  slug: string,
  user: AuthenticatedUser,
): Promise<{ instance: Instance } | { error: string; status: number }> {
  const access = await getInstanceAccess(slug, user);
  if (!access) {
    return { error: "Not found", status: 404 };
  }

  const { instance } = access;

  if (instance.status === "terminated" || instance.status === "terminating") {
    return { error: "Already terminating", status: 400 };
  }

  const result = await pool.query(
    `UPDATE instances SET status = 'terminating', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [instance.id],
  );

  await pool.query(
    `INSERT INTO provision_events (instance_id, phase, status, message)
     VALUES ($1, 'teardown', 'info', 'Teardown requested')`,
    [instance.id],
  );

  return { instance: result.rows[0] };
}

// ─── Credentials ───

export async function getCredentials(
  slug: string,
  user: AuthenticatedUser,
): Promise<
  | { username: string; password: string | null }
  | { error: string; status: number }
> {
  const access = await getInstanceAccess(slug, user);
  if (!access) {
    return { error: "Not found", status: 404 };
  }

  if (access.instance.status !== "ready") {
    return {
      error: "Credentials are only available for ready instances",
      status: 400,
    };
  }

  return {
    username: access.instance.admin_username,
    password: access.instance.admin_password,
  };
}

export async function resetCredentials(
  slug: string,
  user: AuthenticatedUser,
): Promise<
  { username: string; password: string } | { error: string; status: number }
> {
  const access = await getInstanceAccess(slug, user);
  if (!access) {
    return { error: "Not found", status: 404 };
  }

  const { instance } = access;

  if (instance.status !== "ready") {
    return {
      error: "Instance must be ready to reset credentials",
      status: 400,
    };
  }

  if (!instance.admin_password) {
    return {
      error: "No existing credentials — instance may still be provisioning",
      status: 400,
    };
  }

  const newPassword = randomBytes(24).toString("hex");

  await pool.query(
    `UPDATE instances
     SET admin_password = $1, password_reset_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [newPassword, instance.id],
  );

  await pool.query(
    `INSERT INTO provision_events (instance_id, phase, status, message)
     VALUES ($1, 'password_reset', 'info', 'Password reset requested')`,
    [instance.id],
  );

  return { username: instance.admin_username, password: newPassword };
}

// ─── Kubeconfig ───

export async function getKubeconfig(
  slug: string,
  user: AuthenticatedUser,
): Promise<{ kubeconfig: string } | { error: string; status: number }> {
  const access = await getInstanceAccess(slug, user);
  if (!access) {
    return { error: "Not found", status: 404 };
  }

  const { instance } = access;

  if (instance.status !== "ready") {
    return {
      error: "Instance must be ready to download kubeconfig",
      status: 400,
    };
  }

  if (!instance.kubeconfig) {
    return { error: "Kubeconfig not yet available", status: 404 };
  }

  return { kubeconfig: instance.kubeconfig };
}

// ─── Events ───

export async function getEvents(
  slug: string,
  user: AuthenticatedUser,
): Promise<ProvisionEvent[] | { error: string; status: number }> {
  const access = await getInstanceAccess(slug, user);
  if (!access) {
    return { error: "Not found", status: 404 };
  }

  const result = await pool.query(
    `SELECT phase, status, message, created_at
     FROM provision_events
     WHERE instance_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [access.instance.id],
  );

  return result.rows;
}
