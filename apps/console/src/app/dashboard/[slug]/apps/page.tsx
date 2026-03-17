import { notFound, redirect } from "next/navigation";
import { opApiGet } from "@/lib/op-api";
import { InstanceAppList } from "./instance-app-list";

export default async function InstanceAppsPage({
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
        <h1>Apps</h1>
      </div>
      <InstanceAppList slug={slug} />
    </div>
  );
}
