"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

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

export function InstanceManagement({ slug }: { slug: string }) {
  const router = useRouter();

  // Credentials
  const [username, setUsername] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [credLoading, setCredLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Kubeconfig
  const [kubeconfigLoading, setKubeconfigLoading] = useState(false);
  const [kubeconfigError, setKubeconfigError] = useState<string | null>(null);

  // Delete
  const [confirmSlug, setConfirmSlug] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleReset = useCallback(async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setResetting(true);
    setCredError(null);
    try {
      const res = await fetch(`/api/instances/${slug}/credentials`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setCredError(data.error || "Failed to reset password");
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
    } catch {
      setKubeconfigError("Network error. Please try again.");
    } finally {
      setKubeconfigLoading(false);
    }
  }, [slug]);

  const kubectlCmd = `KUBECONFIG=./${slug}-kubeconfig.yaml kubectl get ns`;

  const handleDelete = useCallback(async () => {
    if (confirmSlug !== slug) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/instances/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setDeleteError(data.error || "Failed to delete instance");
        setDeleting(false);
        return;
      }
      router.push("/dashboard");
    } catch {
      setDeleteError("Network error. Please try again.");
      setDeleting(false);
    }
  }, [confirmSlug, slug, router]);

  return (
    <>
      {/* Credentials */}
      <div className="section">
        <div className="section-header">Credentials</div>
        <div className="card">
          <div className="card-body">
            {credLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <span className="spinner spinner-sm" />
                <span className="text-sm text-muted">Loading credentials...</span>
              </div>
            ) : !password ? (
              <p className="text-sm text-muted">Available after provisioning completes.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="credential-row">
                  <span className="credential-label">Username</span>
                  <div className="credential-value-group">
                    <code className="credential-value">{username}</code>
                    <button className="btn-icon" title="Copy username" onClick={() => copyToClipboard(username!, "user")}>
                      {copied === "user" ? <CheckIcon /> : <CopyIcon />}
                    </button>
                  </div>
                </div>
                <div className="credential-row">
                  <span className="credential-label">Password</span>
                  <div className="credential-value-group">
                    <code className="credential-value">
                      {showPassword ? password : "\u2022".repeat(16)}
                    </code>
                    <button className="btn-icon" title={showPassword ? "Hide" : "Show"} onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                    <button className="btn-icon" title="Copy password" onClick={() => copyToClipboard(password!, "pass")}>
                      {copied === "pass" ? <CheckIcon /> : <CopyIcon />}
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <button
                    className={`btn btn-sm ${confirmReset ? "btn-danger" : "btn-ghost"}`}
                    disabled={resetting}
                    onClick={handleReset}
                  >
                    {resetting && <span className="spinner spinner-sm" />}
                    {resetting ? "Resetting..." : confirmReset ? "Confirm reset" : "Reset password"}
                  </button>
                  {confirmReset && !resetting && (
                    <button className="btn btn-sm btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
                  )}
                </div>
                {credError && <p className="form-error" style={{ marginTop: 4 }}>{credError}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cluster Access */}
      <div className="section">
        <div className="section-header">Cluster Access</div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm text-secondary" style={{ marginBottom: 12 }}>
              Full kubectl access from your local machine.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button
                className="btn btn-sm btn-ghost"
                disabled={kubeconfigLoading}
                onClick={downloadKubeconfig}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
              >
                {kubeconfigLoading ? <span className="spinner spinner-sm" /> : <DownloadIcon />}
                {kubeconfigLoading ? "Downloading..." : "Download kubeconfig"}
              </button>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--bg-inset)",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                }}
              >
                <code style={{ flex: 1, overflowX: "auto", whiteSpace: "nowrap" }}>{kubectlCmd}</code>
                <button className="btn-icon" title="Copy command" onClick={() => copyToClipboard(kubectlCmd, "cmd")}>
                  {copied === "cmd" ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>
            </div>
            {kubeconfigError && <p className="form-error" style={{ marginTop: 8 }}>{kubeconfigError}</p>}
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="section">
        <div className="section-header" style={{ color: "var(--danger)" }}>Danger Zone</div>
        <div className="danger-zone">
          <h3>Delete this instance</h3>
          <p>
            This will permanently delete the instance, all its data, and all associated services. This action cannot be undone.
          </p>
          <label htmlFor="confirm-slug" className="form-label" style={{ color: "var(--text-secondary)", marginBottom: 4 }}>
            Type <strong style={{ color: "var(--text-primary)" }}>{slug}</strong> to confirm
          </label>
          <div className="confirm-input-group">
            <input
              id="confirm-slug"
              type="text"
              className="input"
              placeholder={slug}
              value={confirmSlug}
              onChange={(e) => { setConfirmSlug(e.target.value); setDeleteError(null); }}
              autoComplete="off"
            />
            <button
              className="btn btn-danger"
              disabled={confirmSlug !== slug || deleting}
              onClick={handleDelete}
            >
              {deleting && <span className="spinner spinner-sm" />}
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
          {deleteError && <p className="form-error" style={{ marginTop: 8 }}>{deleteError}</p>}
        </div>
      </div>
    </>
  );
}
