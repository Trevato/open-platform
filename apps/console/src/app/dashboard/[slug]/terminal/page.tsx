import { notFound, redirect } from "next/navigation";
import { getInstanceAccess } from "@/lib/instance-access";
import { TerminalView } from "./terminal-view";

export default async function TerminalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getInstanceAccess(slug);

  if (!access) {
    notFound();
  }

  if (access.instance.status !== "ready") {
    redirect(`/dashboard/${slug}`);
  }

  return (
    <div className="terminal-page">
      <TerminalView slug={slug} />
    </div>
  );
}
