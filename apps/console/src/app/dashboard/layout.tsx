import { redirect } from "next/navigation";
import Link from "next/link";
import { UserMenu } from "@/app/components/sign-in-button";
import { getSessionWithRole } from "@/lib/session-role";
import { ClusterSelector } from "@/app/components/cluster-selector";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getSessionWithRole();
  if (!result) redirect("/");
  const isAdmin = result.role === "admin";

  return (
    <div>
      <nav className="nav">
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <Link href="/dashboard" className="nav-brand">
            <div className="nav-brand-mark" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1" y="1" width="4" height="4" rx="1" fill="#0f0f13" />
                <rect x="7" y="1" width="4" height="4" rx="1" fill="#0f0f13" />
                <rect x="1" y="7" width="4" height="4" rx="1" fill="#0f0f13" />
                <rect
                  x="7"
                  y="7"
                  width="4"
                  height="4"
                  rx="1"
                  fill="#0f0f13"
                  opacity="0.4"
                />
              </svg>
            </div>
            Open Platform
          </Link>
          <ClusterSelector isAdmin={isAdmin} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {process.env.NEXT_PUBLIC_PROVISIONER_ENABLED === "true" && (
            <Link
              href="/dashboard/new"
              className="btn btn-accent btn-sm"
              style={{ fontSize: 13 }}
            >
              New Instance
            </Link>
          )}
          <UserMenu />
        </div>
      </nav>
      {children}
    </div>
  );
}
