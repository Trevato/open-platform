import { notFound } from "next/navigation";
import { opApiGet } from "@/lib/op-api";
import { InstanceNav } from "@/app/components/instance-nav";

export default async function InstanceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let data;
  try {
    data = await opApiGet(`/api/v1/instances/${encodeURIComponent(slug)}`);
  } catch {
    notFound();
  }

  const isReady = data.instance.status === "ready";

  if (!isReady) {
    return <main>{children}</main>;
  }

  return (
    <div className="dashboard-body">
      <InstanceNav slug={slug} />
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
