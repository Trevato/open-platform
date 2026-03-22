import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { AgentDetail } from "@/app/components/agent-detail";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");

  const { slug } = await params;

  return (
    <div className="container">
      <AgentDetail slug={slug} />
    </div>
  );
}
