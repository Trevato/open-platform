import Link from "next/link";
import { redirect } from "next/navigation";
import { opApiGet } from "@/lib/op-api";
import { InstanceList } from "@/app/components/instance-list";
import { type Instance } from "@/app/components/instance-card";
import { PlatformNav } from "@/app/components/platform-nav";
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
  if (!result) redirect("/");
  const { role } = result;
  const isAdmin = role === "admin";

  let instances: Instance[] = [];

  try {
    const data = await opApiGet(
      `/api/v1/instances${isAdmin ? "?all=true" : ""}`
    );
    instances = data.instances;
  } catch {
    // If op-api is unreachable, show empty state
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
          {process.env.NEXT_PUBLIC_PROVISIONER_ENABLED === "true" && (
            <Link href="/dashboard/new" className="btn btn-accent">
              <PlusIcon />
              New Instance
            </Link>
          )}
        </div>
      </div>
    );
  }

  const content = (
    <div className="container">
      <div className="dashboard-header">
        <h1>Instances</h1>
        {process.env.NEXT_PUBLIC_PROVISIONER_ENABLED === "true" && (
          <Link href="/dashboard/new" className="btn btn-accent btn-sm">
            <PlusIcon />
            New Instance
          </Link>
        )}
      </div>

      {instances.length === 0 ? (
        <p className="text-sm text-muted" style={{ padding: "24px 0" }}>
          No instances yet. Users will appear here when they create platforms.
        </p>
      ) : (
        <InstanceList initialInstances={instances} isAdmin={isAdmin} />
      )}
    </div>
  );

  if (isAdmin) {
    return (
      <div className="dashboard-body">
        <PlatformNav />
        <main className="dashboard-main">{content}</main>
      </div>
    );
  }

  return content;
}
