import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import pool from "@/lib/db";
import { TerminalView } from "./terminal-view";

export default async function TerminalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  const customerResult = await pool.query(
    `SELECT id FROM customers WHERE user_id = $1`,
    [session.user.id]
  );

  if (customerResult.rows.length === 0) {
    redirect("/dashboard");
  }

  const instanceResult = await pool.query(
    `SELECT slug, display_name, status FROM instances
     WHERE slug = $1 AND customer_id = $2`,
    [slug, customerResult.rows[0].id]
  );

  if (instanceResult.rows.length === 0) {
    notFound();
  }

  const instance = instanceResult.rows[0];

  if (instance.status !== "ready") {
    redirect(`/dashboard/${slug}`);
  }

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <Link
          href={`/dashboard/${slug}`}
          className="text-sm text-muted"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            transition: "color 0.15s",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {instance.display_name}
        </Link>
        <span className="terminal-slug">{slug}</span>
      </div>
      <TerminalView slug={slug} />
    </div>
  );
}
