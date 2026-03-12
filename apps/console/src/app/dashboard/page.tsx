import Link from "next/link";
import pool from "@/lib/db";
import { InstanceList } from "@/app/components/instance-list";
import { type Instance } from "@/app/components/instance-card";
import { PlatformDashboard } from "@/app/components/platform-dashboard";
import { getSessionWithRole } from "@/lib/session-role";

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
  const result = await getSessionWithRole();
  if (!result) return null;
  const { session, role } = result;
  const isAdmin = role === "admin";

  let instances: Instance[] = [];

  if (isAdmin) {
    // Admin sees all instances with owner info
    const allInstances = await pool.query(
      `SELECT i.id, i.slug, i.display_name, i.status, i.tier, i.created_at,
              c.name as owner_name
       FROM instances i
       JOIN customers c ON c.id = i.customer_id
       ORDER BY i.created_at DESC`
    );
    instances = allInstances.rows;
  } else {
    const customerResult = await pool.query(
      `SELECT * FROM customers WHERE user_id = $1`,
      [session.user.id]
    );
    if (customerResult.rows.length > 0) {
      const instancesResult = await pool.query(
        `SELECT id, slug, display_name, status, tier, created_at
         FROM instances
         WHERE customer_id = $1
         ORDER BY created_at DESC`,
        [customerResult.rows[0].id]
      );
      instances = instancesResult.rows;
    }
  }

  if (instances.length === 0 && !isAdmin) {
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

      {instances.length === 0 ? (
        <p className="text-sm text-muted" style={{ padding: "24px 0" }}>
          No instances yet. Users will appear here when they create platforms.
        </p>
      ) : (
        <InstanceList initialInstances={instances} isAdmin={isAdmin} />
      )}

      {isAdmin && (
        <div style={{ marginTop: 40 }}>
          <div className="dashboard-header" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>Platform Health</h2>
          </div>
          <PlatformDashboard />
        </div>
      )}
    </div>
  );
}
