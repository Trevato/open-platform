"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

export default function InstanceSettingsPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [confirmSlug, setConfirmSlug] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Credentials state
  const [username, setUsername] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [credLoading, setCredLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"user" | "pass" | "portfwd" | null>(null);

  // Kubeconfig state
  const [kubeconfigLoading, setKubeconfigLoading] = useState(false);
  const [kubeconfigError, setKubeconfigError] = useState<string | null>(null);
  const kubeconfigDownloaded = useRef(false);

  useEffect(() => {
    fetch(`/api/instances/${slug}/credentials`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setUsername(data.username);
          setPassword(data.password);
        }
      })
      .finally(() => setCredLoading(false));
  }, [slug]);

  const copyToClipboard = useCallback(
    (text: string, field: "user" | "pass" | "portfwd") => {
      navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    },
    []
  );

  const handleReset = useCallback(async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }

    setResetting(true);
    setCredError(null);

    try {
      const res = await fetch(`/api/instances/${slug}/credentials`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        setCredError(data.error || "Failed to reset password");
        setResetting(false);
        setConfirmReset(false);
        return;
      }

      const data = await res.json();
      setPassword(data.password);
      setShowPassword(true);
      setConfirmReset(false);
    } catch {
      setCredError("Network error. Please try again.");
    } finally {
      setResetting(false);
    }
  }, [confirmReset, slug]);

  const downloadKubeconfig = useCallback(async () => {
    setKubeconfigLoading(true);
    setKubeconfigError(null);

    try {
      const res = await fetch(`/api/instances/${slug}/kubeconfig`);

      if (!res.ok) {
        const data = await res.json();
        setKubeconfigError(data.error || "Failed to fetch kubeconfig");
        return;
      }

      const data = await res.json();
      const blob = new Blob([data.kubeconfig], { type: "application/x-yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-kubeconfig.yaml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      kubeconfigDownloaded.current = true;
    } catch {
      setKubeconfigError("Network error. Please try again.");
    } finally {
      setKubeconfigLoading(false);
    }
  }, [slug]);

  const kubectlCmd = `KUBECONFIG=./${slug}-kubeconfig.yaml kubectl get ns`;

  const canDelete = confirmSlug === slug;

  const handleDelete = useCallback(async () => {
    if (!canDelete) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/instances/${slug}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete instance");
        setDeleting(false);
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
      setDeleting(false);
    }
  }, [canDelete, slug, router]);

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 8 }}>
        <Link
          href={`/dashboard/${slug}`}
          className="text-sm text-muted"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            transition: "color 0.15s",
          }}
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
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to instance
        </Link>
      </div>

      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginBottom: 32,
        }}
      >
        Settings
      </h1>

      {/* Credentials */}
      <div className="section">
        <div className="section-header">Credentials</div>
        <div className="card">
          <div className="settings-section">
            <h2>Admin credentials</h2>
            <p>
              Use these credentials to sign in to your Forgejo instance and
              other services.
            </p>

            {credLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
                <span className="spinner spinner-sm" />
                <span className="text-sm text-muted">Loading credentials...</span>
              </div>
            ) : !password ? (
              <div className="settings-placeholder">
                <p>Available after provisioning completes.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Username */}
                <div className="credential-row">
                  <span className="credential-label">Username</span>
                  <div className="credential-value-group">
                    <code className="credential-value">{username}</code>
                    <button
                      className="btn-icon"
                      title="Copy username"
                      onClick={() => copyToClipboard(username!, "user")}
                    >
                      {copied === "user" ? <CheckIcon /> : <CopyIcon />}
                    </button>
                  </div>
                </div>

                {/* Password */}
                <div className="credential-row">
                  <span className="credential-label">Password</span>
                  <div className="credential-value-group">
                    <code className="credential-value">
                      {showPassword ? password : "\u2022".repeat(16)}
                    </code>
                    <button
                      className="btn-icon"
                      title={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                    <button
                      className="btn-icon"
                      title="Copy password"
                      onClick={() => copyToClipboard(password!, "pass")}
                    >
                      {copied === "pass" ? <CheckIcon /> : <CopyIcon />}
                    </button>
                  </div>
                </div>

                {/* Reset */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <button
                    className={`btn btn-sm ${confirmReset ? "btn-danger" : "btn-ghost"}`}
                    disabled={resetting}
                    onClick={handleReset}
                  >
                    {resetting && <span className="spinner spinner-sm" />}
                    {resetting
                      ? "Resetting..."
                      : confirmReset
                        ? "Confirm reset"
                        : "Reset password"}
                  </button>
                  {confirmReset && !resetting && (
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => setConfirmReset(false)}
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {credError && (
                  <p className="form-error" style={{ marginTop: 4 }}>
                    {credError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cluster Access */}
      <div className="section">
        <div className="section-header">Cluster Access</div>
        <div className="card">
          <div className="settings-section">
            <h2>kubectl access</h2>
            <p>
              Full cluster access via kubectl. Your API server is at{" "}
              <code style={{ fontSize: 12 }}>{slug}-k8s.open-platform.sh</code>.
            </p>

            <ol style={{ margin: "12px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              <li>
                <span style={{ fontWeight: 500 }}>
                  Connect your machine to the cluster network
                </span>
                <p className="text-sm text-muted" style={{ margin: "4px 0 0", lineHeight: 1.5 }}>
                  Install{" "}
                  <a
                    href="https://tailscale.com/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--text-link)" }}
                  >
                    Tailscale
                  </a>
                  {" "}and join the same network as your cluster node.
                  Direct LAN access also works if you&apos;re on the same network.
                </p>
              </li>

              <li>
                <span style={{ fontWeight: 500 }}>Download kubeconfig</span>
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={kubeconfigLoading}
                    onClick={downloadKubeconfig}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    {kubeconfigLoading ? (
                      <span className="spinner spinner-sm" />
                    ) : (
                      <DownloadIcon />
                    )}
                    {kubeconfigLoading ? "Downloading..." : "Download kubeconfig"}
                  </button>
                </div>
              </li>

              <li>
                <span style={{ fontWeight: 500 }}>Verify the connection</span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "var(--bg-tertiary)",
                    borderRadius: 6,
                    padding: "8px 12px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    marginTop: 8,
                  }}
                >
                  <code style={{ flex: 1, overflowX: "auto", whiteSpace: "nowrap" }}>
                    {kubectlCmd}
                  </code>
                  <button
                    className="btn-icon"
                    title="Copy command"
                    onClick={() => copyToClipboard(kubectlCmd, "portfwd")}
                  >
                    {copied === "portfwd" ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>
              </li>
            </ol>

            {kubeconfigError && (
              <p className="form-error" style={{ marginTop: 8 }}>
                {kubeconfigError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Domain */}
      <div className="section">
        <div className="section-header">Domain</div>
        <div className="card">
          <div className="settings-section">
            <h2>Custom domains</h2>
            <div className="settings-placeholder">
              <p>Custom domain configuration coming soon.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="section">
        <div className="section-header">Danger zone</div>
        <div className="danger-zone">
          <h3>Delete this instance</h3>
          <p>
            This will permanently delete the instance, all its data, and
            all associated services. This action cannot be undone.
          </p>

          <label
            htmlFor="confirm-slug"
            className="form-label"
            style={{ color: "var(--text-secondary)", marginBottom: 4 }}
          >
            Type <strong style={{ color: "var(--text-primary)" }}>{slug}</strong>{" "}
            to confirm
          </label>

          <div className="confirm-input-group">
            <input
              id="confirm-slug"
              type="text"
              className="input"
              placeholder={slug}
              value={confirmSlug}
              onChange={(e) => {
                setConfirmSlug(e.target.value);
                setError(null);
              }}
              autoComplete="off"
            />
            <button
              className="btn btn-danger"
              disabled={!canDelete || deleting}
              onClick={handleDelete}
            >
              {deleting && <span className="spinner spinner-sm" />}
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>

          {error && (
            <p className="form-error" style={{ marginTop: 8 }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
