import { auth } from "@/auth";
import { headers } from "next/headers";
import pool from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RsvpButtons } from "@/app/components/rsvp-buttons";
import { DeleteEventButton } from "@/app/components/delete-event-button";

interface Rsvp {
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  status: "going" | "maybe" | "not_going";
}

function formatFullDate(dateStr: string, timeStr: string | null): string {
  const date = new Date(dateStr + "T00:00:00");
  const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
  const monthName = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.getDate();
  const year = date.getFullYear();

  let formatted = `${dayName}, ${monthName} ${day}, ${year}`;

  if (timeStr) {
    const [hours, minutes] = timeStr.split(":");
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h % 12 || 12;
    formatted += ` at ${displayHour}:${minutes} ${ampm}`;
  }

  return formatted;
}

function Avatar({
  name,
  avatar,
  size = 36,
}: {
  name: string | null;
  avatar: string | null;
  size?: number;
}) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#2a2a3a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 600,
        color: "#6666a0",
        flexShrink: 0,
      }}
    >
      {(name || "?")[0]?.toUpperCase()}
    </div>
  );
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eventId = parseInt(id, 10);

  if (isNaN(eventId)) notFound();

  const session = await auth.api.getSession({ headers: await headers() });

  const eventResult = await pool.query(
    "SELECT * FROM events WHERE id = $1",
    [eventId],
  );

  if (eventResult.rows.length === 0) notFound();

  const event = eventResult.rows[0];

  const rsvpResult = await pool.query(
    `SELECT user_id, user_name, user_avatar, status
     FROM rsvps WHERE event_id = $1
     ORDER BY
       CASE status WHEN 'going' THEN 0 WHEN 'maybe' THEN 1 ELSE 2 END,
       created_at ASC`,
    [eventId],
  );

  const rsvps = rsvpResult.rows as Rsvp[];
  const goingList = rsvps.filter((r) => r.status === "going");
  const maybeList = rsvps.filter((r) => r.status === "maybe");

  const currentUserRsvp = session?.user
    ? rsvps.find((r) => r.user_id === session.user.id)?.status || null
    : null;

  const isOrganizer = session?.user?.id === event.organizer_id;
  const isPast = new Date(event.event_date + "T23:59:59") < new Date();

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
        <Link
          href="/"
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "#e0e0f0",
            textDecoration: "none",
          }}
        >
          events
        </Link>
      </header>

      {/* Hero section */}
      <div
        style={{
          height: 200,
          background: event.cover_image_url
            ? `url(${event.cover_image_url}) center/cover no-repeat`
            : "linear-gradient(135deg, #1a1a2e 0%, #2a1a4a 50%, #1a1a2e 100%)",
          position: "relative",
        }}
      >
        {isPast && (
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "rgba(0,0,0,0.7)",
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: "#e17055",
              letterSpacing: "0.05em",
            }}
          >
            PAST EVENT
          </div>
        )}
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 16px" }}>
        {/* Event info */}
        <div
          style={{
            background: "#1a1a24",
            border: "1px solid #2a2a3a",
            borderRadius: 16,
            padding: "28px",
            marginTop: -40,
            position: "relative",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: "#e0e0f0",
              lineHeight: 1.3,
            }}
          >
            {event.title}
          </h1>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 14,
              color: "#8888a0",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6c5ce7"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {formatFullDate(event.event_date, event.event_time)}
            </div>

            {event.location && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#6c5ce7"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {event.location}
              </div>
            )}

            {event.max_attendees && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#6c5ce7"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                {goingList.length} / {event.max_attendees} spots filled
              </div>
            )}
          </div>

          {/* Organizer */}
          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid #2a2a3a",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Avatar
              name={event.organizer_name}
              avatar={event.organizer_avatar}
              size={28}
            />
            <div>
              <span style={{ fontSize: 12, color: "#6666a0" }}>
                Organized by
              </span>{" "}
              <span style={{ fontSize: 13, fontWeight: 500, color: "#e0e0f0" }}>
                {event.organizer_name || "Unknown"}
              </span>
            </div>
          </div>

          {event.description && (
            <p
              style={{
                marginTop: 20,
                fontSize: 15,
                color: "#a0a0c0",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
              }}
            >
              {event.description}
            </p>
          )}

          {isOrganizer && (
            <div style={{ marginTop: 20 }}>
              <DeleteEventButton eventId={event.id} />
            </div>
          )}
        </div>

        {/* RSVP section */}
        {!isPast && (
          <div
            style={{
              background: "#1a1a24",
              border: "1px solid #2a2a3a",
              borderRadius: 16,
              padding: "24px 28px",
              marginTop: 16,
            }}
          >
            <h2
              style={{
                margin: "0 0 16px",
                fontSize: 16,
                fontWeight: 600,
                color: "#e0e0f0",
              }}
            >
              RSVP
            </h2>
            <RsvpButtons
              eventId={event.id}
              currentStatus={currentUserRsvp}
              isAuthenticated={!!session?.user}
            />
          </div>
        )}

        {/* Attendees */}
        {(goingList.length > 0 || maybeList.length > 0) && (
          <div
            style={{
              background: "#1a1a24",
              border: "1px solid #2a2a3a",
              borderRadius: 16,
              padding: "24px 28px",
              marginTop: 16,
              marginBottom: 32,
            }}
          >
            {goingList.length > 0 && (
              <>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#00b894",
                    marginBottom: 12,
                  }}
                >
                  Going ({goingList.length})
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    marginBottom: maybeList.length > 0 ? 20 : 0,
                  }}
                >
                  {goingList.map((rsvp) => (
                    <div
                      key={rsvp.user_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Avatar
                        name={rsvp.user_name}
                        avatar={rsvp.user_avatar}
                        size={30}
                      />
                      <span
                        style={{
                          fontSize: 14,
                          color: "#e0e0f0",
                          fontWeight: 500,
                        }}
                      >
                        {rsvp.user_name || "Anonymous"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {maybeList.length > 0 && (
              <>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#fdcb6e",
                    marginBottom: 12,
                  }}
                >
                  Maybe ({maybeList.length})
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  {maybeList.map((rsvp) => (
                    <div
                      key={rsvp.user_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Avatar
                        name={rsvp.user_name}
                        avatar={rsvp.user_avatar}
                        size={30}
                      />
                      <span
                        style={{
                          fontSize: 14,
                          color: "#e0e0f0",
                          fontWeight: 500,
                        }}
                      >
                        {rsvp.user_name || "Anonymous"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {goingList.length === 0 && maybeList.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "32px 0",
              color: "#4a4a6a",
              fontSize: 14,
              marginBottom: 32,
            }}
          >
            No RSVPs yet. Be the first!
          </div>
        )}
      </div>
    </main>
  );
}
