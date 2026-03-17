import { notFound, redirect } from "next/navigation";
import { opApiGet } from "@/lib/op-api";
import { GettingStarted } from "../components/getting-started";

export default async function LearnPage({
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

  const domain = process.env.PLATFORM_DOMAIN || "open-platform.sh";

  return (
    <div className="container">
      <GettingStarted slug={slug} domain={domain} />
    </div>
  );
}
