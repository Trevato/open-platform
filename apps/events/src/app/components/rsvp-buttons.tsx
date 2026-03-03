"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RsvpStatus = "going" | "maybe" | "not_going" | null;

interface RsvpButtonsProps {
  eventId: number;
  currentStatus: RsvpStatus;
  isAuthenticated: boolean;
}

export function RsvpButtons({
  eventId,
  currentStatus,
  isAuthenticated,
}: RsvpButtonsProps) {
  const router = useRouter();
  const [status, setStatus] = useState<RsvpStatus>(currentStatus);
  const [loading, setLoading] = useState(false);

  if (!isAuthenticated) {
    return (
      <p style={{ fontSize: 14, color: "#6666a0" }}>
        Sign in to RSVP
      </p>
    );
  }

  async function handleRsvp(newStatus: "going" | "maybe" | "not_going") {
    setLoading(true);
    try {
      if (status === newStatus) {
        await fetch(`/api/events/${eventId}/rsvp`, { method: "DELETE" });
        setStatus(null);
      } else {
        const res = await fetch(`/api/events/${eventId}/rsvp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || "Failed to RSVP");
          return;
        }
        setStatus(newStatus);
      }
      router.refresh();
    } catch {
      alert("Failed to update RSVP");
    } finally {
      setLoading(false);
    }
  }

  const buttons: { value: "going" | "maybe" | "not_going"; label: string; color: string }[] = [
    { value: "going", label: "Going", color: "#00b894" },
    { value: "maybe", label: "Maybe", color: "#fdcb6e" },
    { value: "not_going", label: "Can't Go", color: "#e17055" },
  ];

  return (
    <div style={{ display: "flex", gap: 10 }}>
      {buttons.map((btn) => {
        const isActive = status === btn.value;
        return (
          <button
            key={btn.value}
            onClick={() => handleRsvp(btn.value)}
            disabled={loading}
            style={{
              flex: 1,
              padding: "10px 16px",
              background: isActive ? btn.color : "#12121a",
              color: isActive ? "#0f0f13" : "#8888a0",
              border: `1px solid ${isActive ? btn.color : "#2a2a3a"}`,
              borderRadius: 10,
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {btn.label}
          </button>
        );
      })}
    </div>
  );
}
