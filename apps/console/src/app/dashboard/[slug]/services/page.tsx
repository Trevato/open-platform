import { notFound, redirect } from "next/navigation";
import { getInstanceAccess } from "@/lib/instance-access";
import { InstanceServiceList } from "./instance-service-list";

export default async function InstanceServicesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getInstanceAccess(slug);
  if (!access) notFound();
  if (access.instance.status !== "ready") redirect(`/dashboard/${slug}`);

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Services</h1>
      </div>
      <InstanceServiceList slug={slug} />
    </div>
  );
}
