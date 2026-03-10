"use client";

import { useState, useEffect, useCallback } from "react";

interface Step {
  id: string;
  title: string;
  description: string;
  detail: React.ReactNode;
}

function CheckCircle({ checked }: { checked: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      {checked ? (
        <>
          <circle cx="10" cy="10" r="10" fill="var(--status-ready)" />
          <path
            d="M6 10l2.5 2.5L14 7.5"
            stroke="#0f0f13"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <circle
          cx="10"
          cy="10"
          r="9"
          stroke="var(--border)"
          strokeWidth="2"
          fill="none"
        />
      )}
    </svg>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      className="btn-icon"
      onClick={copy}
      title="Copy"
      style={{ marginLeft: 4 }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {copied ? (
          <path d="M20 6L9 17l-5-5" />
        ) : (
          <>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </>
        )}
      </svg>
    </button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="checklist-code">
      <code>{children}</code>
      <CopyButton text={children} />
    </div>
  );
}

export function GettingStarted({
  slug,
  domain,
}: {
  slug: string;
  domain: string;
}) {
  const storageKey = `getting-started-${slug}`;
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{
    username: string;
    password: string;
  } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setCompleted(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    fetch(`/api/instances/${slug}/credentials`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setCredentials(data);
      })
      .catch(() => {});
  }, [slug]);

  const toggle = (id: string) => {
    const next = { ...completed, [id]: !completed[id] };
    setCompleted(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const toggleExpand = (id: string) => {
    setExpanded(expanded === id ? null : id);
  };

  const forgejoUrl = `https://${slug}-forgejo.${domain}`;

  const steps: Step[] = [
    {
      id: "sign-in",
      title: "Sign in to Forgejo",
      description: "Use your admin credentials to access the git server.",
      detail: (
        <div className="checklist-detail">
          {credentials ? (
            <div className="checklist-credentials">
              <div className="credential-row">
                <span className="credential-label">Username</span>
                <div className="credential-value-group">
                  <span className="credential-value">
                    {credentials.username}
                  </span>
                  <CopyButton text={credentials.username} />
                </div>
              </div>
              <div className="credential-row">
                <span className="credential-label">Password</span>
                <div className="credential-value-group">
                  <span className="credential-value">
                    {credentials.password}
                  </span>
                  <CopyButton text={credentials.password} />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Loading credentials...</p>
          )}
          <a
            href={forgejoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 12, alignSelf: "flex-start" }}
          >
            Open Forgejo
          </a>
        </div>
      ),
    },
    {
      id: "create-org",
      title: "Create your organization",
      description: "Organizations group your repos, teams, and CI secrets.",
      detail: (
        <div className="checklist-detail">
          <p className="text-sm text-secondary" style={{ marginBottom: 12 }}>
            Organizations make it easy to manage repos and CI secrets for your
            team.
          </p>
          <a
            href={`${forgejoUrl}/org/create`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: "flex-start" }}
          >
            Create Organization
          </a>
        </div>
      ),
    },
    {
      id: "create-app",
      title: "Create an app from the template",
      description: "Use the built-in template to scaffold a full-stack app.",
      detail: (
        <div className="checklist-detail">
          <p className="text-sm text-secondary" style={{ marginBottom: 8 }}>
            The <strong>system/template</strong> repo includes Next.js, Postgres,
            S3, auth, and CI workflows out of the box.
          </p>
          <p className="text-sm text-secondary" style={{ marginBottom: 12 }}>
            Go to your org, click <strong>New Repository</strong>, then select{" "}
            <strong>system/template</strong> as the template.
          </p>
          <a
            href={`${forgejoUrl}/repo/create`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: "flex-start" }}
          >
            New Repository
          </a>
        </div>
      ),
    },
    {
      id: "push-code",
      title: "Push code and trigger CI",
      description: "Clone your new repo, make changes, and push.",
      detail: (
        <div className="checklist-detail">
          <CodeBlock>{`git clone ${forgejoUrl}/your-org/your-app.git`}</CodeBlock>
          <p
            className="text-sm text-secondary"
            style={{ marginTop: 8 }}
          >
            Pushing to <strong>main</strong> triggers the deploy pipeline
            automatically via Woodpecker CI.
          </p>
        </div>
      ),
    },
    {
      id: "see-it-live",
      title: "See it live",
      description: "Your app deploys at a predictable URL.",
      detail: (
        <div className="checklist-detail">
          <CodeBlock>{`https://${slug}-<app>.${domain}`}</CodeBlock>
          <p className="text-sm text-secondary" style={{ marginTop: 8 }}>
            Replace <code>&lt;app&gt;</code> with your repo name. Open PRs get
            preview deployments at{" "}
            <code>
              pr-N-&lt;app&gt;.{domain}
            </code>
            .
          </p>
        </div>
      ),
    },
  ];

  const completedCount = steps.filter((s) => completed[s.id]).length;
  const allDone = completedCount === steps.length;

  return (
    <div className="section">
      <div
        className="section-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>Getting Started</span>
        <span
          className="text-xs"
          style={{
            color: allDone ? "var(--status-ready)" : "var(--text-muted)",
            textTransform: "none",
            letterSpacing: "normal",
            fontWeight: 500,
          }}
        >
          {completedCount}/{steps.length}
        </span>
      </div>
      <div className="card">
        <div className="checklist">
          {steps.map((step) => {
            const isDone = completed[step.id];
            const isExpanded = expanded === step.id;

            return (
              <div
                key={step.id}
                className={`checklist-item${isDone ? " checklist-item-done" : ""}`}
              >
                <div className="checklist-item-row">
                  <button
                    className="checklist-check"
                    onClick={() => toggle(step.id)}
                    aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                  >
                    <CheckCircle checked={isDone} />
                  </button>
                  <button
                    className="checklist-content"
                    onClick={() => toggleExpand(step.id)}
                  >
                    <span
                      className={`checklist-title${isDone ? " checklist-title-done" : ""}`}
                    >
                      {step.title}
                    </span>
                    <span className="checklist-description">
                      {step.description}
                    </span>
                  </button>
                  <button
                    className="btn-icon checklist-expand"
                    onClick={() => toggleExpand(step.id)}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        transform: isExpanded
                          ? "rotate(180deg)"
                          : "rotate(0deg)",
                        transition: "transform 0.15s ease",
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
                {isExpanded && (
                  <div className="checklist-item-detail">{step.detail}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
