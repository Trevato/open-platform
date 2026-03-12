import { notFound } from "next/navigation";
import { getInstanceAccess } from "@/lib/instance-access";
import { DevPodList } from "@/app/components/dev-pod-list";

export default async function InstanceDevPodsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getInstanceAccess(slug);
  if (!access) notFound();

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Dev Pods</h1>
      </div>
      <DevPodList slug={slug} />
    </div>
  );
}
