import { notFound, redirect } from "next/navigation";
import { getInstanceAccess } from "@/lib/instance-access";
import { InstanceManagement } from "../components/instance-management";

export default async function InstanceSettingsPage({
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
      <InstanceManagement slug={slug} />
    </div>
  );
}
