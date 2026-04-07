import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { opApiGet } from "@/lib/op-api";
import { SettingsEditor } from "./settings-editor";

export default async function PlatformSettingsPage() {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");

  let config = null;
  try {
    const data = await opApiGet("/api/v1/platform/config");
    config = data.config;
  } catch {
    // Config API not available — show fallback
  }

  let nodes = null;
  try {
    const nodesData = await opApiGet("/api/v1/platform/nodes");
    nodes = nodesData.nodes;
  } catch {
    // Nodes API not available
  }

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginBottom: 32,
        }}
      >
        Platform Settings
      </h1>
      <SettingsEditor initialConfig={config} initialNodes={nodes} />
    </div>
  );
}
