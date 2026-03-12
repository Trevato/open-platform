import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { AppList } from "@/app/components/app-list";

export default async function AppsPage() {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Apps</h1>
      </div>
      <AppList />
    </div>
  );
}
