import { auth } from "@/auth";
import { headers } from "next/headers";
import { checkIsAdmin } from "./roles";
import pool from "./db";

export async function getInstanceAccess(slug: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const isAdmin = await checkIsAdmin(session.user.name);

  if (isAdmin) {
    const result = await pool.query(
      `SELECT i.*, c.email as owner_email, c.name as owner_name
       FROM instances i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.slug = $1`,
      [slug]
    );
    if (result.rows.length === 0) return null;
    return { instance: result.rows[0], isAdmin: true, session };
  }

  const result = await pool.query(
    `SELECT i.*
     FROM instances i
     JOIN customers c ON c.id = i.customer_id
     WHERE i.slug = $1 AND c.user_id = $2`,
    [slug, session.user.id]
  );
  if (result.rows.length === 0) return null;
  return { instance: result.rows[0], isAdmin: false, session };
}
