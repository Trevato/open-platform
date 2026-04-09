"use client";

import { useState, useCallback } from "react";

interface Org {
  username: string;
}

interface DomainsInfo {
  domains: string[];
  primary: string;
}

interface OrgDomain {
  org: string;
  domain: string | null;
}

interface DomainManagerProps {
  orgs: Org[];
  domainsInfo: DomainsInfo;
  initialAssignments: OrgDomain[];
}

type SaveState = "idle" | "saving" | "saved" | "error";

interface RowState {
  domain: string;
  saveState: SaveState;
  error: string;
}

export function DomainManager({
  orgs,
  domainsInfo,
  initialAssignments,
}: DomainManagerProps) {
  const buildInitialState = useCallback(() => {
    const state: Record<string, RowState> = {};
    for (const org of orgs) {
      const assignment = initialAssignments.find((a) => a.org === org.username);
      state[org.username] = {
        domain: assignment?.domain || domainsInfo.primary,
        saveState: "idle",
        error: "",
      };
    }
    return state;
  }, [orgs, initialAssignments, domainsInfo.primary]);

  const [rows, setRows] = useState<Record<string, RowState>>(buildInitialState);

  async function handleDomainChange(orgName: string, newDomain: string) {
    setRows((prev) => ({
      ...prev,
      [orgName]: {
        ...prev[orgName],
        domain: newDomain,
        saveState: "saving",
        error: "",
      },
    }));

    try {
      const res = await fetch(
        `/api/orgs/${encodeURIComponent(orgName)}/domain`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: newDomain }),
        },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update");
      }

      setRows((prev) => ({
        ...prev,
        [orgName]: { ...prev[orgName], saveState: "saved", error: "" },
      }));

      setTimeout(() => {
        setRows((prev) => ({
          ...prev,
          [orgName]: { ...prev[orgName], saveState: "idle" },
        }));
      }, 2000);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network error";
      setRows((prev) => ({
        ...prev,
        [orgName]: { ...prev[orgName], saveState: "error", error: message },
      }));
    }
  }

  if (orgs.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg
            className="icon-lg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ color: "var(--accent)" }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
        <h2>No organizations</h2>
        <p>Create an organization in Forgejo to assign domains.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-body" style={{ padding: 0 }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--border)",
              }}
            >
              <th
                style={{
                  textAlign: "left",
                  padding: "12px 20px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Organization
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "12px 20px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Domain
              </th>
              <th
                style={{
                  width: 80,
                  padding: "12px 20px",
                }}
              />
            </tr>
          </thead>
          <tbody>
            {orgs.map((org, i) => {
              const row = rows[org.username];
              const isLast = i === orgs.length - 1;

              return (
                <tr
                  key={org.username}
                  style={{
                    borderBottom: isLast ? "none" : "1px solid var(--border)",
                  }}
                >
                  <td
                    style={{
                      padding: "14px 20px",
                      fontWeight: 500,
                    }}
                  >
                    {org.username}
                  </td>
                  <td style={{ padding: "10px 20px" }}>
                    <select
                      className="input"
                      value={row?.domain || domainsInfo.primary}
                      onChange={(e) =>
                        handleDomainChange(org.username, e.target.value)
                      }
                      disabled={row?.saveState === "saving"}
                      style={{
                        width: "auto",
                        minWidth: 240,
                        padding: "8px 36px 8px 12px",
                        fontSize: 13,
                      }}
                    >
                      {domainsInfo.domains.map((d) => (
                        <option key={d} value={d}>
                          {d}
                          {d === domainsInfo.primary ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td
                    style={{
                      padding: "14px 20px",
                      textAlign: "right",
                    }}
                  >
                    {row?.saveState === "saving" && (
                      <span className="text-sm text-muted">Saving...</span>
                    )}
                    {row?.saveState === "saved" && (
                      <span
                        className="text-sm"
                        style={{ color: "var(--status-ready)" }}
                      >
                        Saved
                      </span>
                    )}
                    {row?.saveState === "error" && (
                      <span
                        className="text-sm"
                        style={{ color: "var(--danger)" }}
                        title={row.error}
                      >
                        Error
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
