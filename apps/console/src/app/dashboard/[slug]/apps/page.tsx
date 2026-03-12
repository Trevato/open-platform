import { notFound, redirect } from "next/navigation";
import { getInstanceAccess } from "@/lib/instance-access";
import { InstanceAppList } from "./instance-app-list";

export default async function InstanceAppsPage({
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
        <h1>Apps</h1>
      </div>
      <InstanceAppList slug={slug} />
    </div>
  );
}
