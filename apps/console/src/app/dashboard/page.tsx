import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { PlatformNav } from "@/app/components/platform-nav";
import { PlatformDashboard } from "@/app/components/platform-dashboard";

export default async function DashboardPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/");

  return (
    <div className="dashboard-body">
      <PlatformNav />
      <main className="dashboard-main">
        <div className="container">
          <PlatformDashboard />
        </div>
      </main>
    </div>
  );
}
