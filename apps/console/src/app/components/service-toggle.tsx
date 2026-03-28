"use client";

import { useState } from "react";

interface ServiceToggleProps {
  name: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => Promise<void>;
}

export function ServiceToggle({
  name,
  description,
  enabled,
  onToggle,
}: ServiceToggleProps) {
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    setLoading(true);
    setError(null);
    try {
      await onToggle(!current);
      setCurrent(!current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ minWidth: 160 }}>
      <div
        className="card-body"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "16px 20px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
              {name}
            </h3>
            <p className="text-xs text-muted">{description}</p>
          </div>
          <button
            onClick={handleToggle}
            disabled={loading}
            className={`toggle-btn ${current ? "toggle-on" : "toggle-off"}`}
            style={{
              position: "relative",
              width: 44,
              height: 24,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: current ? "var(--accent)" : "var(--bg-inset)",
              cursor: loading ? "wait" : "pointer",
              flexShrink: 0,
              transition: "background 0.2s",
              padding: 0,
            }}
            aria-label={`${current ? "Disable" : "Enable"} ${name}`}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: current ? 22 : 2,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "white",
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
            {loading && (
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span className="spinner" style={{ width: 12, height: 12 }} />
              </span>
            )}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-xs" style={{ color: "var(--error, #e55)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
