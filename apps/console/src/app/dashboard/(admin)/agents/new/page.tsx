import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { CreateAgentForm } from "@/app/components/create-agent-form";

export default async function NewAgentPage() {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Create Agent</h1>
      </div>
      <CreateAgentForm />
    </div>
  );
}
