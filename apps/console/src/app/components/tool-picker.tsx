"use client";

import { useState, useCallback, useMemo } from "react";

// ── Tool Catalog ────────────────────────────────────────────────────────────
// Hardcoded from op-api MCP server registration (13 categories, 61 tools).
// Kept in sync with apps/op-api/src/mcp/tools/*.ts.

interface Tool {
  name: string;
  description: string;
}

interface Category {
  name: string;
  tools: Tool[];
}

const TOOL_CATALOG: Category[] = [
  {
    name: "Organizations",
    tools: [
      {
        name: "list_orgs",
        description: "List organizations accessible to the user",
      },
      {
        name: "create_org",
        description: "Create a new organization (admin only)",
      },
    ],
  },
  {
    name: "Repositories",
    tools: [
      {
        name: "list_repos",
        description: "List repositories in an organization",
      },
      { name: "get_repo", description: "Get repository details" },
      {
        name: "create_repo",
        description: "Create a new empty repository in an organization",
      },
      {
        name: "delete_repo",
        description: "Delete a repository (destructive, cannot be undone)",
      },
      {
        name: "create_repo_from_template",
        description: "Create a new app from the system template",
      },
    ],
  },
  {
    name: "Pull Requests",
    tools: [
      { name: "list_prs", description: "List pull requests" },
      { name: "create_pr", description: "Create a pull request" },
      { name: "merge_pr", description: "Merge a pull request" },
      { name: "comment_on_pr", description: "Add a comment to a pull request" },
      {
        name: "approve_pr",
        description: "Approve a pull request with an optional review comment",
      },
    ],
  },
  {
    name: "Issues",
    tools: [
      { name: "list_issues", description: "List issues in a repository" },
      {
        name: "create_issue",
        description:
          "Create an issue with optional labels, milestone, and assignees",
      },
      {
        name: "update_issue",
        description:
          "Update an issue's title, body, state, labels, or assignees",
      },
      { name: "comment_on_issue", description: "Add a comment to an issue" },
      { name: "list_labels", description: "List labels in a repository" },
      { name: "create_label", description: "Create a label in a repository" },
      {
        name: "create_milestone",
        description: "Create a milestone in a repository",
      },
    ],
  },
  {
    name: "Branches",
    tools: [
      { name: "list_branches", description: "List branches in a repository" },
      {
        name: "create_branch",
        description: "Create a new branch from an existing branch",
      },
      {
        name: "delete_branch",
        description: "Delete a branch from a repository",
      },
    ],
  },
  {
    name: "Files",
    tools: [
      {
        name: "get_file_content",
        description: "Read a file from a repository",
      },
      {
        name: "create_or_update_file",
        description: "Write a file to a repository via the contents API",
      },
    ],
  },
  {
    name: "Pipelines",
    tools: [
      { name: "trigger_deploy", description: "Trigger a deployment pipeline" },
      { name: "get_pipeline_status", description: "Get pipeline status" },
      {
        name: "get_pipeline_logs",
        description: "Get logs for a pipeline step",
      },
    ],
  },
  {
    name: "Apps",
    tools: [
      { name: "list_apps", description: "List all deployed applications" },
      {
        name: "get_app_status",
        description: "Get application deployment status",
      },
      {
        name: "get_platform_status",
        description: "Get platform health and all service statuses",
      },
    ],
  },
  {
    name: "Agents",
    tools: [
      { name: "list_agents", description: "List all AI agents (admin only)" },
      { name: "get_agent", description: "Get an AI agent by slug" },
      {
        name: "create_agent",
        description:
          "Create a new AI agent with a Forgejo identity (admin only)",
      },
      {
        name: "update_agent",
        description: "Update an AI agent's configuration",
      },
      {
        name: "delete_agent",
        description: "Delete an AI agent and its Forgejo identity",
      },
      {
        name: "activate_agent",
        description: "Manually trigger an AI agent with a prompt",
      },
    ],
  },
  {
    name: "Users",
    tools: [
      { name: "whoami", description: "Get current authenticated user info" },
    ],
  },
  {
    name: "Platform",
    tools: [
      {
        name: "list_platform_services",
        description: "List platform service statuses (admin only)",
      },
      {
        name: "list_platform_users",
        description: "List all Forgejo users (admin only)",
      },
      {
        name: "create_platform_user",
        description: "Create a new Forgejo user (admin only)",
      },
      {
        name: "list_platform_apps",
        description: "List all deployed applications",
      },
      {
        name: "create_platform_app",
        description: "Create a new app from the system template (admin only)",
      },
    ],
  },
  {
    name: "Instances",
    tools: [
      { name: "list_instances", description: "List instances" },
      { name: "create_instance", description: "Create a new instance" },
      { name: "get_instance", description: "Get instance details" },
      {
        name: "delete_instance",
        description: "Delete (terminate) an instance",
      },
      {
        name: "get_instance_credentials",
        description: "Get instance admin credentials",
      },
      {
        name: "reset_instance_credentials",
        description: "Reset instance admin password",
      },
      {
        name: "get_instance_kubeconfig",
        description: "Get instance kubeconfig",
      },
      {
        name: "list_instance_services",
        description: "List services in an instance",
      },
      {
        name: "list_instance_apps",
        description: "List deployed apps in an instance",
      },
    ],
  },
  {
    name: "Dev Pods",
    tools: [
      {
        name: "list_dev_pods",
        description: "List dev pods on the host platform",
      },
      {
        name: "create_dev_pod",
        description: "Create a dev pod for the current user",
      },
      { name: "get_dev_pod", description: "Get dev pod status by username" },
      { name: "control_dev_pod", description: "Start or stop a dev pod" },
      { name: "delete_dev_pod", description: "Delete a dev pod" },
      {
        name: "list_instance_dev_pods",
        description: "List dev pods in an instance",
      },
      {
        name: "create_instance_dev_pod",
        description: "Create a dev pod in an instance",
      },
      {
        name: "get_instance_dev_pod",
        description: "Get dev pod status in an instance",
      },
      {
        name: "control_instance_dev_pod",
        description: "Start or stop a dev pod in an instance",
      },
      {
        name: "delete_instance_dev_pod",
        description: "Delete a dev pod in an instance",
      },
    ],
  },
];

const ALL_TOOL_NAMES = TOOL_CATALOG.flatMap((c) => c.tools.map((t) => t.name));
const TOTAL_TOOLS = ALL_TOOL_NAMES.length;

// ── Presets ──────────────────────────────────────────────────────────────────

interface Preset {
  label: string;
  tools: string[] | null; // null = all tools
}

const PRESETS: Preset[] = [
  { label: "All Tools", tools: null },
  {
    label: "Project Manager",
    tools: [
      "list_issues",
      "create_issue",
      "update_issue",
      "comment_on_issue",
      "list_labels",
      "create_label",
      "create_milestone",
      "list_prs",
      "create_pr",
      "merge_pr",
      "comment_on_pr",
      "approve_pr",
      "get_pipeline_status",
      "get_pipeline_logs",
      "trigger_deploy",
      "list_repos",
      "get_repo",
    ],
  },
  {
    label: "Code Reviewer",
    tools: [
      "list_repos",
      "get_repo",
      "list_prs",
      "comment_on_pr",
      "approve_pr",
      "list_branches",
      "get_file_content",
      "list_issues",
      "comment_on_issue",
      "get_pipeline_status",
    ],
  },
  {
    label: "Builder",
    tools: [
      "list_repos",
      "get_repo",
      "create_repo",
      "list_branches",
      "create_branch",
      "delete_branch",
      "get_file_content",
      "create_or_update_file",
      "list_prs",
      "create_pr",
      "trigger_deploy",
      "get_pipeline_status",
      "get_pipeline_logs",
      "list_apps",
      "get_app_status",
    ],
  },
  {
    label: "Read Only",
    tools: ALL_TOOL_NAMES.filter(
      (n) => n.startsWith("list_") || n.startsWith("get_") || n === "whoami",
    ),
  },
];

// ── Component ───────────────────────────────────────────────────────────────

interface ToolPickerProps {
  value: string[] | null; // null = all tools
  onChange: (tools: string[] | null) => void;
}

const MONO_FONT = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace";

export function ToolPicker({ value, onChange }: ToolPickerProps) {
  const [customizing, setCustomizing] = useState(value !== null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const selected = useMemo(() => new Set(value ?? ALL_TOOL_NAMES), [value]);

  const activePreset = useMemo(() => {
    if (value === null) return "All Tools";
    for (const preset of PRESETS) {
      if (preset.tools === null) continue;
      if (
        preset.tools.length === value.length &&
        preset.tools.every((t) => value.includes(t))
      ) {
        return preset.label;
      }
    }
    return null;
  }, [value]);

  const toggleCategory = useCallback((categoryName: string) => {
    setExpanded((prev) => ({ ...prev, [categoryName]: !prev[categoryName] }));
  }, []);

  const toggleTool = useCallback(
    (toolName: string) => {
      const next = new Set(selected);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      onChange(next.size === TOTAL_TOOLS ? null : Array.from(next));
    },
    [selected, onChange],
  );

  const toggleCategoryAll = useCallback(
    (category: Category) => {
      const categoryNames = category.tools.map((t) => t.name);
      const allSelected = categoryNames.every((n) => selected.has(n));
      const next = new Set(selected);
      for (const name of categoryNames) {
        if (allSelected) {
          next.delete(name);
        } else {
          next.add(name);
        }
      }
      onChange(next.size === TOTAL_TOOLS ? null : Array.from(next));
    },
    [selected, onChange],
  );

  const applyPreset = useCallback(
    (preset: Preset) => {
      onChange(preset.tools);
      if (preset.tools === null) {
        setCustomizing(false);
      } else {
        setCustomizing(true);
      }
    },
    [onChange],
  );

  // Collapsed "all tools" view
  if (!customizing && value === null) {
    return (
      <div className="form-group">
        <label className="form-label">Allowed Tools</label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          <span>All {TOTAL_TOOLS} tools enabled</span>
          <button
            type="button"
            onClick={() => setCustomizing(true)}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent)",
              cursor: "pointer",
              padding: 0,
              fontSize: 13,
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            customize
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-group">
      <label className="form-label">Allowed Tools</label>

      {/* Presets */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 10,
        }}
      >
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset)}
            style={{
              padding: "3px 10px",
              fontSize: 12,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background:
                activePreset === preset.label
                  ? "var(--accent)"
                  : "var(--surface)",
              color:
                activePreset === preset.label
                  ? "#fff"
                  : "var(--text-secondary)",
              cursor: "pointer",
              fontWeight: activePreset === preset.label ? 600 : 400,
              transition: "all 120ms ease",
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Category list */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 6,
          maxHeight: 360,
          overflowY: "auto",
          background: "var(--surface)",
        }}
      >
        {TOOL_CATALOG.map((category) => {
          const categoryNames = category.tools.map((t) => t.name);
          const selectedCount = categoryNames.filter((n) =>
            selected.has(n),
          ).length;
          const allSelected = selectedCount === categoryNames.length;
          const someSelected = selectedCount > 0 && !allSelected;
          const isExpanded = expanded[category.name] ?? false;

          return (
            <div
              key={category.name}
              style={{
                borderBottom: "1px solid var(--border)",
              }}
            >
              {/* Category header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() => toggleCategory(category.name)}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    width: 12,
                    flexShrink: 0,
                    transition: "transform 120ms ease",
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    display: "inline-block",
                  }}
                >
                  &#9654;
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
                  {category.name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginRight: 6,
                  }}
                >
                  {selectedCount}/{categoryNames.length}
                </span>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleCategoryAll(category);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                />
              </div>

              {/* Tools */}
              {isExpanded && (
                <div style={{ paddingBottom: 4 }}>
                  {category.tools.map((tool) => (
                    <label
                      key={tool.name}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        padding: "3px 10px 3px 30px",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(tool.name)}
                        onChange={() => toggleTool(tool.name)}
                        style={{
                          marginTop: 2,
                          cursor: "pointer",
                          accentColor: "var(--accent)",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 1,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: MONO_FONT,
                            fontSize: 12,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {tool.name}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            lineHeight: 1.3,
                          }}
                        >
                          {tool.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <span className="form-hint" style={{ marginTop: 4 }}>
        {value === null
          ? `All ${TOTAL_TOOLS} tools enabled.`
          : `${selected.size} of ${TOTAL_TOOLS} tools selected.`}{" "}
        Controls which MCP tools are available in chat mode.
      </span>
    </div>
  );
}
