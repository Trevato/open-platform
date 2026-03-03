"use client";

import { useRouter, useSearchParams } from "next/navigation";

const periods = [
  { value: "all", label: "All Time" },
  { value: "week", label: "This Week" },
  { value: "today", label: "Today" },
];

export function PeriodFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("period") || "all";

  return (
    <div style={{ display: "flex", gap: 4, background: "#12121a", borderRadius: 8, padding: 4 }}>
      {periods.map((p) => (
        <button
          key={p.value}
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            if (p.value === "all") {
              params.delete("period");
            } else {
              params.set("period", p.value);
            }
            const qs = params.toString();
            router.push(qs ? `?${qs}` : "?");
          }}
          style={{
            padding: "6px 16px",
            background: current === p.value ? "#2a2a3a" : "transparent",
            color: current === p.value ? "#e2e2e8" : "#666",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: current === p.value ? 600 : 400,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
