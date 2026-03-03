"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";

export function CreateEventForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/events", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to create event");
        return;
      }

      formRef.current?.reset();
      setFileName(null);
      onClose();
      router.refresh();
    } catch {
      alert("Failed to create event");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#1a1a24",
          border: "1px solid #2a2a3a",
          borderRadius: 16,
          padding: "28px 28px 24px",
        }}
      >
        <h2
          style={{
            margin: "0 0 24px",
            fontSize: 20,
            fontWeight: 600,
            color: "#e0e0f0",
          }}
        >
          Create Event
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input
            name="title"
            placeholder="Event title"
            required
            style={inputStyle}
          />

          <textarea
            name="description"
            placeholder="What's this event about?"
            rows={3}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Date</label>
              <input
                name="event_date"
                type="date"
                required
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Time</label>
              <input name="event_time" type="time" style={inputStyle} />
            </div>
          </div>

          <input
            name="location"
            placeholder="Location"
            style={inputStyle}
          />

          <input
            name="max_attendees"
            type="number"
            min="1"
            placeholder="Max attendees (optional)"
            style={inputStyle}
          />

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              fontSize: 14,
              color: "#8888a0",
            }}
          >
            <input
              type="file"
              name="cover_image"
              accept="image/*"
              onChange={(e) => setFileName(e.target.files?.[0]?.name || null)}
              style={{ display: "none" }}
            />
            <span
              style={{
                padding: "8px 14px",
                border: "1px solid #2a2a3a",
                borderRadius: 8,
                fontSize: 13,
                color: "#8888a0",
                background: "#12121a",
              }}
            >
              {fileName || "Add cover image"}
            </span>
          </label>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            marginTop: 24,
          }}
        >
          <button type="button" onClick={onClose} style={cancelButtonStyle}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "10px 24px",
              background: submitting ? "#4a4a6a" : "#6c5ce7",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 500,
              cursor: submitting ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {submitting ? "Creating..." : "Create Event"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: "#12121a",
  border: "1px solid #2a2a3a",
  borderRadius: 10,
  fontSize: 14,
  color: "#e0e0f0",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#6666a0",
  marginBottom: 6,
  fontWeight: 500,
};

const cancelButtonStyle: React.CSSProperties = {
  padding: "10px 20px",
  background: "none",
  border: "1px solid #2a2a3a",
  borderRadius: 10,
  fontSize: 14,
  color: "#8888a0",
  cursor: "pointer",
};
