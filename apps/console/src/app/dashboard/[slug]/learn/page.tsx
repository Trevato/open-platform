import { notFound, redirect } from "next/navigation";
import { getInstanceAccess } from "@/lib/instance-access";
import { GettingStarted } from "../components/getting-started";

export default async function LearnPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getInstanceAccess(slug);
  if (!access) notFound();
  if (access.instance.status !== "ready") redirect(`/dashboard/${slug}`);

  const domain = process.env.MANAGED_DOMAIN || "open-platform.sh";

  return (
    <div className="container">
      <GettingStarted slug={slug} domain={domain} />
    </div>
  );
}
