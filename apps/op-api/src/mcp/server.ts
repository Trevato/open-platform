import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ForgejoClient } from "../services/forgejo.js";
import { WoodpeckerClient } from "../services/woodpecker.js";
import type { AuthenticatedUser } from "../auth.js";
import { registerOrgTools } from "./tools/org-tools.js";
import { registerRepoTools } from "./tools/repo-tools.js";
import { registerPrTools } from "./tools/pr-tools.js";
import { registerPipelineTools } from "./tools/pipeline-tools.js";
import { registerAppTools } from "./tools/app-tools.js";
import { registerUserTools } from "./tools/user-tools.js";
import { registerIssueTools } from "./tools/issue-tools.js";
import { registerBranchTools } from "./tools/branch-tools.js";
import { registerFileTools } from "./tools/file-tools.js";
import { registerPlatformTools } from "./tools/platform-tools.js";
import { registerInstanceTools } from "./tools/instance-tools.js";
import { registerDevPodTools } from "./tools/devpod-tools.js";

export function createMcpServer(user: AuthenticatedUser): McpServer {
  const server = new McpServer({
    name: "open-platform",
    version: "1.0.0",
  });

  const forgejo = new ForgejoClient(user.token);
  const woodpecker = new WoodpeckerClient();

  registerOrgTools(server, forgejo, user);
  registerRepoTools(server, forgejo);
  registerPrTools(server, forgejo);
  registerIssueTools(server, forgejo);
  registerBranchTools(server, forgejo);
  registerFileTools(server, forgejo);
  registerPipelineTools(server, woodpecker);
  registerAppTools(server);
  registerUserTools(server, user);
  registerPlatformTools(server, forgejo, user);
  registerInstanceTools(server, user);
  registerDevPodTools(server, user);

  return server;
}
