import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { AgentList } from "@/app/components/agent-list";

export default async function AgentsPage() {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Agents</h1>
      </div>
      <AgentList />
    </div>
  );
}
