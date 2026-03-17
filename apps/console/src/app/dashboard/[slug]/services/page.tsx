import { notFound, redirect } from "next/navigation";
import { opApiGet } from "@/lib/op-api";
import { InstanceServiceList } from "./instance-service-list";

export default async function InstanceServicesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let data;
  try {
    data = await opApiGet(`/api/v1/instances/${encodeURIComponent(slug)}`);
  } catch {
    notFound();
  }

  if (data.instance.status !== "ready") redirect(`/dashboard/${slug}`);

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Services</h1>
      </div>
      <InstanceServiceList slug={slug} />
    </div>
  );
}
