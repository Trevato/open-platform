import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { McpConnector } from "./mcp-connector";

export default async function McpPage() {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");

  const domain = process.env.PLATFORM_DOMAIN ?? "localhost";
  const prefix = process.env.SERVICE_PREFIX ?? "";

  return (
    <div className="container" style={{ maxWidth: 800 }}>
      <div className="dashboard-header">
        <h1>MCP</h1>
      </div>
      <McpConnector domain={domain} prefix={prefix} />
    </div>
  );
}
