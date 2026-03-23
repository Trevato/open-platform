import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { opApiGet } from "@/lib/op-api";
import { AgentEditForm } from "@/app/components/agent-edit-form";

export default async function AgentEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");

  const { slug } = await params;

  let agent;
  try {
    const data = await opApiGet(`/api/v1/agents/${encodeURIComponent(slug)}`);
    agent = data.agent;
  } catch {
    redirect(`/dashboard/agents/${slug}`);
  }

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Edit {agent.name}</h1>
      </div>
      <AgentEditForm agent={agent} />
    </div>
  );
}
