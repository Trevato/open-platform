import Link from "next/link";
import { StatusBadge } from "./status-badge";

interface Instance {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  created_at: string;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ServiceCount({ status }: { status: string }) {
  if (status === "ready") {
    return <span className="text-sm text-muted">5 services</span>;
  }
  return null;
}

export function InstanceCard({ instance }: { instance: Instance }) {
  return (
    <Link href={`/dashboard/${instance.slug}`}>
      <div className="card card-interactive">
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                {instance.display_name}
              </h3>
              <p className="text-sm text-muted">{instance.slug}</p>
            </div>
            <StatusBadge status={instance.status} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="text-xs text-muted">
              Created {formatDate(instance.created_at)}
            </span>
            <ServiceCount status={instance.status} />
          </div>
        </div>
      </div>
    </Link>
  );
}
