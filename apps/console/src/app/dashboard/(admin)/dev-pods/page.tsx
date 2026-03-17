import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { DevPodList } from "@/app/components/dev-pod-list";

export default async function DevPodsPage() {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Dev Pods</h1>
      </div>
      <DevPodList />
    </div>
  );
}
