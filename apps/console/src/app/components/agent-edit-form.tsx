"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToolPicker } from "./tool-picker";

interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  model: string;
  instructions: string | null;
  orgs: string[];
  max_steps: number;
  schedule: string | null;
  allowed_tools: string[] | null;
}

interface AgentEditFormProps {
  agent: Agent;
}

export function AgentEditForm({ agent }: AgentEditFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description || "");
  const [model, setModel] = useState(agent.model);
  const [instructions, setInstructions] = useState(agent.instructions || "");
  const [organizations, setOrganizations] = useState(
    agent.orgs?.join(", ") || "",
  );
  const [maxSteps, setMaxSteps] = useState(agent.max_steps);
  const [schedule, setSchedule] = useState(agent.schedule || "");
  // Normalize [] from DB (means "all tools") to null (ToolPicker sentinel for all tools)
  const [allowedTools, setAllowedTools] = useState<string[] | null>(
    agent.allowed_tools?.length ? agent.allowed_tools : null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        model,
        max_steps: maxSteps,
        description: description.trim() || null,
        instructions: instructions.trim() || null,
        schedule: schedule.trim() || null,
      };

      body.allowed_tools = allowedTools ?? [];

      body.orgs = organizations.trim()
        ? organizations
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      const res = await fetch(`/api/agents/${encodeURIComponent(agent.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update agent");
        return;
      }

      router.push(`/dashboard/agents/${agent.slug}`);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            borderColor: "var(--status-failed)",
            background: "var(--status-failed-bg)",
          }}
        >
          <div className="card-body">
            <p style={{ fontSize: 14, color: "var(--status-failed)" }}>
              {error}
            </p>
          </div>
        </div>
      )}

      <div className="card" style={{ maxWidth: 640, margin: "0 auto" }}>
        <div
          className="card-body"
          style={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          {/* Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="agent-name">
              Name *
            </label>
            <input
              id="agent-name"
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
            <span className="form-hint">
              The slug ({agent.slug}) cannot be changed.
            </span>
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label" htmlFor="agent-description">
              Description
            </label>
            <textarea
              id="agent-description"
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Model */}
          <div className="form-group">
            <label className="form-label" htmlFor="agent-model">
              Model
            </label>
            <select
              id="agent-model"
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
              <option value="claude-opus-4-6">Claude Opus 4.6</option>
              <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
            </select>
          </div>

          {/* Instructions */}
          <div className="form-group">
            <label className="form-label" htmlFor="agent-instructions">
              Instructions
            </label>
            <textarea
              id="agent-instructions"
              className="input"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={5}
              style={{
                resize: "vertical",
                fontFamily:
                  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                fontSize: 13,
              }}
            />
            <span className="form-hint">System prompt for the agent.</span>
          </div>

          {/* Organizations */}
          <div className="form-group">
            <label className="form-label" htmlFor="agent-orgs">
              Organizations
            </label>
            <input
              id="agent-orgs"
              className="input"
              type="text"
              value={organizations}
              onChange={(e) => setOrganizations(e.target.value)}
            />
            <span className="form-hint">
              Comma-separated. Changing orgs will update Forgejo memberships.
            </span>
          </div>

          {/* Tools */}
          <ToolPicker value={allowedTools} onChange={setAllowedTools} />

          {/* Max Steps */}
          <div className="form-group">
            <label className="form-label" htmlFor="agent-max-steps">
              Max Steps
            </label>
            <input
              id="agent-max-steps"
              className="input"
              type="number"
              min={1}
              max={500}
              value={maxSteps}
              onChange={(e) => setMaxSteps(parseInt(e.target.value, 10) || 25)}
              style={{ maxWidth: 120 }}
            />
          </div>

          {/* Schedule */}
          <div className="form-group">
            <label className="form-label" htmlFor="agent-schedule">
              Schedule
            </label>
            <input
              id="agent-schedule"
              className="input"
              type="text"
              placeholder="*/30 * * * *"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              style={{
                fontFamily:
                  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                fontSize: 13,
              }}
            />
            <span className="form-hint">
              Cron expression. Leave empty for manual-only activation. Examples:{" "}
              <code>*/30 * * * *</code> (every 30 min), <code>0 9 * * 1-5</code>{" "}
              (weekdays at 9am).
            </span>
          </div>

          {/* Submit */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 4,
              borderTop: "1px solid var(--border)",
              paddingTop: 16,
            }}
          >
            <button
              type="submit"
              className="btn btn-accent"
              disabled={submitting || !name.trim()}
            >
              {submitting ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => router.push(`/dashboard/agents/${agent.slug}`)}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
