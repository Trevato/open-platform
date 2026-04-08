import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { statusCommand } from "./commands/status.js";
import { whoamiCommand } from "./commands/whoami.js";
import { appCommand } from "./commands/app.js";
import { prCommand } from "./commands/pr.js";
import { pipelineCommand } from "./commands/pipeline.js";
import {
  issueCommand,
  labelCommand,
  milestoneCommand,
} from "./commands/issue.js";
import { branchCommand } from "./commands/branch.js";
import { fileCommand } from "./commands/file.js";
import { serviceCommand } from "./commands/service.js";
import { userCommand } from "./commands/user.js";

const program = new Command()
  .name("op")
  .description("Open Platform CLI")
  .version("1.0.0");

program.addCommand(loginCommand);
program.addCommand(statusCommand);
program.addCommand(whoamiCommand);
program.addCommand(appCommand);
program.addCommand(prCommand);
program.addCommand(pipelineCommand);
program.addCommand(issueCommand);
program.addCommand(labelCommand);
program.addCommand(milestoneCommand);
program.addCommand(branchCommand);
program.addCommand(fileCommand);
program.addCommand(serviceCommand);
program.addCommand(userCommand);

program.parse();
