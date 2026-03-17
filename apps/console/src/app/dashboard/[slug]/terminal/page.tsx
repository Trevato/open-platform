import { notFound, redirect } from "next/navigation";
import { opApiGet } from "@/lib/op-api";
import { TerminalView } from "./terminal-view";

export default async function TerminalPage({
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

  if (data.instance.status !== "ready") {
    redirect(`/dashboard/${slug}`);
  }

  return (
    <div className="terminal-page">
      <TerminalView slug={slug} />
    </div>
  );
}
