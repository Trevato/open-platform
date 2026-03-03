"use client";

import { useState } from "react";
import { CreateEventForm } from "./create-event-form";

export function CreateEventButton() {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowForm(true)}
        style={{
          padding: "10px 22px",
          background: "#6c5ce7",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          transition: "opacity 0.15s",
        }}
      >
        Create Event
      </button>
      {showForm && <CreateEventForm onClose={() => setShowForm(false)} />}
    </>
  );
}
