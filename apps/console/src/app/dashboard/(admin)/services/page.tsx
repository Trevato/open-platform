import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { ServiceList } from "@/app/components/service-list";

export default async function ServicesPage() {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Services</h1>
      </div>
      <ServiceList />
    </div>
  );
}
