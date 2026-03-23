"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateAgentForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [instructions, setInstructions] = useState("");
  const [organizations, setOrganizations] = useState("");
  const [maxSteps, setMaxSteps] = useState(25);
  const [schedule, setSchedule] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        model,
        max_steps: maxSteps,
      };
      if (description.trim()) body.description = description.trim();
      if (instructions.trim()) body.instructions = instructions.trim();
      if (organizations.trim()) {
        body.orgs = organizations
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (schedule.trim()) body.schedule = schedule.trim();

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create agent");
        return;
      }

      const data = await res.json();
      router.push(`/dashboard/agents/${data.agent?.slug || ""}`);
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
              placeholder="PR Reviewer"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
            <span className="form-hint">
              A human-readable name. The slug and Forgejo username will be
              derived from this.
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
              placeholder="Reviews pull requests and leaves feedback..."
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
              placeholder="You are a code reviewer. Focus on correctness, security, and clarity..."
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
            <span className="form-hint">
              System prompt for the agent. Defines its personality and behavior.
            </span>
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
              placeholder="system, my-team"
              value={organizations}
              onChange={(e) => setOrganizations(e.target.value)}
            />
            <span className="form-hint">
              Comma-separated organization names. The agent will be added as a
              member.
            </span>
          </div>

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
            <span className="form-hint">
              Maximum number of tool-use steps per conversation turn.
            </span>
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
              Cron expression for automatic activation. Leave empty for
              manual-only. Examples: <code>*/30 * * * *</code> (every 30 min),{" "}
              <code>0 9 * * 1-5</code> (weekdays at 9am).
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
              {submitting ? "Creating..." : "Create Agent"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => router.push("/dashboard/agents")}
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
