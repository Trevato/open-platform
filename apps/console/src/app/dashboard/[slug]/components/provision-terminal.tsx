"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ProvisionEvent {
  phase: string;
  status: string;
  message: string;
  created_at: string;
}

const PHASE_LABELS: Record<string, string> = {
  // Provisioner phases (from provision-instance.sh)
  init: "Initializing",
  config: "Configuration",
  namespace: "Kubernetes namespace",
  "vcluster-create": "Creating cluster",
  "vcluster-ready": "Cluster ready check",
  kubeconfig: "Kubeconfig",
  "port-forward": "Cluster connection",
  "config-gen": "Generating config",
  deploy: "Deploying platform",
  "deploy-helmfile": "Installing services",
  "deploy-post": "Post-deploy setup",
  "deploy-oidc": "Identity provider",
  metadata: "Storing metadata",
  complete: "Complete",
  // Reconciler phases
  provisioning_started: "Provisioning started",
  provisioning_complete: "Provisioning complete",
  provisioning_failed: "Provisioning failed",
  teardown_started: "Teardown started",
  teardown_complete: "Teardown complete",
  teardown_failed: "Teardown failed",
  password_reset: "Password reset",
  // Legacy phases
  cluster: "Kubernetes cluster",
  database: "PostgreSQL database",
  storage: "Object storage",
  identity: "Forgejo \u2014 git and identity",
  ci: "Woodpecker CI",
  template: "App template",
  dns: "DNS configuration",
  teardown: "Teardown",
};

function formatElapsed(start: string, end?: string): string {
  const ms =
    (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function ProvisionTerminal({
  slug,
  initialEvents,
  instanceStatus,
}: {
  slug: string;
  initialEvents: ProvisionEvent[];
  instanceStatus: string;
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [status, setStatus] = useState(instanceStatus);

  const isActive = status === "pending" || status === "provisioning";

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/instances/${slug}`);
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events);
      setStatus(data.instance.status);
      if (
        data.instance.status !== "pending" &&
        data.instance.status !== "provisioning"
      ) {
        router.refresh();
      }
    } catch {
      // silent — retry on next interval
    }
  }, [slug, router]);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [isActive, poll]);

  // Deduplicate by phase, keep latest event per phase
  const phaseMap = new Map<string, ProvisionEvent>();
  // Events are DESC — reverse to process oldest first
  for (const event of [...events].reverse()) {
    phaseMap.set(event.phase, event);
  }

  const phases = Array.from(phaseMap.values());

  return (
    <div className="deploy-terminal" style={{ marginBottom: 32 }}>
      <div className="deploy-terminal-header">
        <div className="deploy-terminal-dot" />
        <div className="deploy-terminal-dot" />
        <div className="deploy-terminal-dot" />
      </div>
      <div className="deploy-terminal-body">
        <div className="deploy-line visible">
          <span className="deploy-cmd">$ provisioning {slug}...</span>
        </div>
        {phases.map((event) => {
          const label = PHASE_LABELS[event.phase] || event.phase;
          const isSuccess = event.status === "success";
          const isError = event.status === "error";
          const isRunning = event.status === "info" || event.status === "warning";

          return (
            <div key={event.phase} className="deploy-line visible">
              {isSuccess && (
                <>
                  <span className="deploy-check">{"\u2713"} {label}</span>
                  <span className="deploy-elapsed">
                    {formatElapsed(event.created_at)}
                  </span>
                </>
              )}
              {isError && (
                <>
                  <span className="deploy-error">{"\u2717"} {label}</span>
                  {event.message && (
                    <span className="deploy-elapsed">{event.message}</span>
                  )}
                </>
              )}
              {isRunning && (
                <span className="deploy-active">
                  {"\u25CF"} {label}
                  {event.message ? ` \u2014 ${event.message}` : "..."}
                </span>
              )}
            </div>
          );
        })}
        {status === "ready" && (
          <div className="deploy-line visible" style={{ marginTop: 8 }}>
            <span className="deploy-result">
              Ready. Your platform is live.
            </span>
          </div>
        )}
        {status === "error" && (
          <div className="deploy-line visible" style={{ marginTop: 8 }}>
            <span className="deploy-error">
              Provisioning failed. Check events for details.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
