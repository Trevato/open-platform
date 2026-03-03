"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export function PastEvents({ children, count }: { children: ReactNode; count: number }) {
  const [expanded, setExpanded] = useState(false);

  if (count === 0) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "none",
          border: "none",
          color: "#6666a0",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          padding: "8px 0",
          marginBottom: expanded ? 16 : 0,
        }}
      >
        <span
          style={{
            display: "inline-block",
            transition: "transform 0.2s",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          &#9654;
        </span>
        Past Events ({count})
      </button>
      {expanded && children}
    </div>
  );
}
