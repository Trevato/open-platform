import { notFound } from "next/navigation";
import { getInstanceAccess } from "@/lib/instance-access";
import { InstanceNav } from "@/app/components/instance-nav";

export default async function InstanceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getInstanceAccess(slug);
  if (!access) notFound();

  const isReady = access.instance.status === "ready";

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
