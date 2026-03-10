import { auth } from "@/auth";
import { headers } from "next/headers";
import Link from "next/link";
import pool from "@/lib/db";
import { InstanceList } from "@/app/components/instance-list";

function PlusIcon() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg
      className="icon-lg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ color: "var(--accent)" }}
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M12 12h.01" />
      <path d="M17 12h.01" />
      <path d="M7 12h.01" />
    </svg>
  );
}

export default async function DashboardPage() {
  // Session is validated by the dashboard layout — no redirect needed here.
  // We still read it for the user ID to query customer data.
  // Non-null assertion: layout guarantees authenticated session
  const session = (await auth.api.getSession({ headers: await headers() }))!;

  const customerResult = await pool.query(
    `SELECT * FROM customers WHERE user_id = $1`,
    [session.user.id]
  );

  let instances: Array<{
    id: string;
    slug: string;
    display_name: string;
    status: string;
    created_at: string;
  }> = [];

  if (customerResult.rows.length > 0) {
    const instancesResult = await pool.query(
      `SELECT id, slug, display_name, status, created_at
       FROM instances
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [customerResult.rows[0].id]
    );
    instances = instancesResult.rows;
  }

  if (instances.length === 0) {
    return (
      <div className="container">
        <div className="empty-state">
          <div className="empty-state-icon">
            <EmptyIcon />
          </div>
          <h2>Create your first platform</h2>
          <p>
            Deploy a fully managed developer platform with Git, CI/CD,
            dashboards, and object storage.
          </p>
          <Link href="/dashboard/new" className="btn btn-accent">
            <PlusIcon />
            New Instance
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Instances</h1>
        <Link href="/dashboard/new" className="btn btn-accent btn-sm">
          <PlusIcon />
          New Instance
        </Link>
      </div>
      <InstanceList initialInstances={instances} />
    </div>
  );
}
