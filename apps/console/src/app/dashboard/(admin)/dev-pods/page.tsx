import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DevPodList } from "@/app/components/dev-pod-list";

export default async function DevPodsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Dev Pods</h1>
      </div>
      <DevPodList />
    </div>
  );
}
