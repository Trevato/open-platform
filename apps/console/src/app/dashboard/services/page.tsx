import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isHosted } from "@/lib/mode";
import { ServiceList } from "@/app/components/service-list";

export default async function ServicesPage() {
  if (isHosted) redirect("/dashboard");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Services</h1>
      </div>
      <ServiceList />
    </div>
  );
}
