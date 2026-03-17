import { notFound, redirect } from "next/navigation";
import { opApiGet } from "@/lib/op-api";
import { InstanceManagement } from "../components/instance-management";

export default async function InstanceSettingsPage({
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
      <InstanceManagement slug={slug} />
    </div>
  );
}
