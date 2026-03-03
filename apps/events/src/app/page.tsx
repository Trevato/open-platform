import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "@/lib/db";
import { SignInButton, SignOutButton } from "@/app/components/sign-in-button";
import { CreateEventButton } from "@/app/components/create-event-button";
import { PastEvents } from "@/app/components/past-events";
import Link from "next/link";

interface EventRow {
  id: number;
  title: string;
  description: string | null;
  event_date: string | Date;
  event_time: string | null;
  location: string | null;
  cover_image_url: string | null;
  organizer_name: string | null;
  going_count: number;
  maybe_count: number;
}

function parseEventDate(dateStr: string | Date): Date {
  // node-pg may return DATE columns as Date objects or ISO strings
  const str = dateStr instanceof Date ? dateStr.toISOString() : String(dateStr);
  const plain = str.split("T")[0];
  return new Date(plain + "T00:00:00");
}

function formatEventDate(dateStr: string | Date): { month: string; day: string } {
  const date = parseEventDate(dateStr);
  return {
    month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: date.getDate().toString(),
  };
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return "";
  const [hours, minutes] = timeStr.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

function EventCard({ event }: { event: EventRow }) {
  const { month, day } = formatEventDate(event.event_date);
  const str = event.event_date instanceof Date ? event.event_date.toISOString() : String(event.event_date);
  const plain = str.split("T")[0];
  const isPast = new Date(plain + "T23:59:59") < new Date();
  const attendeeCount = event.going_count + event.maybe_count;

  return (
    <Link
      href={`/events/${event.id}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <article
        style={{
          background: "#1a1a24",
          border: "1px solid #2a2a3a",
          borderRadius: 14,
          padding: "20px 22px",
          display: "flex",
          gap: 18,
          opacity: isPast ? 0.6 : 1,
          transition: "border-color 0.15s, transform 0.1s",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            minWidth: 56,
            height: 64,
            background: isPast ? "#1e1e28" : "#2a1a4a",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: isPast ? "#6666a0" : "#a78bfa",
              letterSpacing: "0.05em",
            }}
          >
            {month}
          </span>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: isPast ? "#6666a0" : "#e0e0f0",
              lineHeight: 1.1,
            }}
          >
            {day}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: "#e0e0f0",
              lineHeight: 1.3,
            }}
          >
            {event.title}
          </h3>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px 16px",
              marginTop: 6,
              fontSize: 13,
              color: "#8888a0",
            }}
          >
            {event.event_time && (
              <span>{formatTime(event.event_time)}</span>
            )}
            {event.location && (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {event.location}
              </span>
            )}
          </div>

          {event.description && (
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 14,
                color: "#6666a0",
                lineHeight: 1.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {event.description}
            </p>
          )}

          {attendeeCount > 0 && (
            <div
              style={{
                marginTop: 10,
                fontSize: 13,
                color: "#6c5ce7",
                fontWeight: 500,
              }}
            >
              {event.going_count > 0 && (
                <span>{event.going_count} going</span>
              )}
              {event.going_count > 0 && event.maybe_count > 0 && (
                <span style={{ color: "#3a3a4a" }}> &middot; </span>
              )}
              {event.maybe_count > 0 && (
                <span style={{ color: "#fdcb6e" }}>
                  {event.maybe_count} maybe
                </span>
              )}
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  const result = await pool.query(`
    SELECT
      e.*,
      COALESCE(r.going_count, 0)::int AS going_count,
      COALESCE(r.maybe_count, 0)::int AS maybe_count
    FROM events e
    LEFT JOIN (
      SELECT
        event_id,
        COUNT(*) FILTER (WHERE status = 'going') AS going_count,
        COUNT(*) FILTER (WHERE status = 'maybe') AS maybe_count
      FROM rsvps
      GROUP BY event_id
    ) r ON r.event_id = e.id
    ORDER BY
      CASE WHEN e.event_date >= CURRENT_DATE THEN 0 ELSE 1 END,
      CASE WHEN e.event_date >= CURRENT_DATE THEN e.event_date END ASC,
      CASE WHEN e.event_date < CURRENT_DATE THEN e.event_date END DESC
  `);

  const events = result.rows as EventRow[];
  const now = new Date();
  const upcoming = events.filter((e) => {
    const str = e.event_date instanceof Date ? e.event_date.toISOString() : String(e.event_date);
    const plain = str.split("T")[0];
    return new Date(plain + "T23:59:59") >= now;
  });
  const past = events.filter((e) => {
    const str = e.event_date instanceof Date ? e.event_date.toISOString() : String(e.event_date);
    const plain = str.split("T")[0];
    return new Date(plain + "T23:59:59") < now;
  });

  return (
    <main style={{ minHeight: "100vh" }}>
      <header
        style={{
          borderBottom: "1px solid #1e1e28",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#0f0f13",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "#e0e0f0",
          }}
        >
          events
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {session?.user ? (
            <>
              <span style={{ fontSize: 14, color: "#8888a0" }}>
                {session.user.name}
              </span>
              <SignOutButton />
            </>
          ) : (
            <SignInButton />
          )}
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 500,
              color: "#8888a0",
            }}
          >
            Upcoming
          </h2>
          {session?.user && <CreateEventButton />}
        </div>

        {upcoming.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "48px 0",
              color: "#4a4a6a",
              fontSize: 15,
            }}
          >
            No upcoming events. {session?.user ? "Create one!" : "Check back later."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}

        <PastEvents count={past.length}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </PastEvents>
      </div>
    </main>
  );
}
