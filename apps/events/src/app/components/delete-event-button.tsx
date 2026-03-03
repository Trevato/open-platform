"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteEventButton({ eventId }: { eventId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this event?")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete event");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      alert("Failed to delete event");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      style={{
        padding: "8px 16px",
        background: "none",
        border: "1px solid #3a2020",
        borderRadius: 8,
        fontSize: 13,
        color: "#e17055",
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {loading ? "Deleting..." : "Delete Event"}
    </button>
  );
}
