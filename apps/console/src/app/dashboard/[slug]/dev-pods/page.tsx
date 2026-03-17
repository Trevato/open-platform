import { notFound } from "next/navigation";
import { opApiGet } from "@/lib/op-api";
import { DevPodList } from "@/app/components/dev-pod-list";

export default async function InstanceDevPodsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  try {
    await opApiGet(`/api/v1/instances/${encodeURIComponent(slug)}`);
  } catch {
    notFound();
  }

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Dev Pods</h1>
      </div>
      <DevPodList slug={slug} />
    </div>
  );
}
