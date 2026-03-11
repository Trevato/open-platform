import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import pool from "@/lib/db";
import { StatusBadge } from "@/app/components/status-badge";
import { ProvisionTerminal } from "./components/provision-terminal";
import { GettingStarted } from "./components/getting-started";

interface ProvisionEvent {
  phase: string;
  status: string;
  message: string;
  created_at: string;
}

interface Instance {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  admin_email: string;
  created_at: string;
  provisioned_at: string | null;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(date: string): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function timelineDotClass(status: string): string {
  switch (status) {
    case "success":
      return "timeline-dot-success";
    case "error":
      return "timeline-dot-error";
    case "warning":
      return "timeline-dot-warning";
    default:
      return "timeline-dot-info";
  }
}

function ServiceCards({ slug, domain }: { slug: string; domain: string }) {
  const services = [
    {
      name: "Git and Code",
      icon: "git",
      iconClass: "service-icon-git",
      url: `${slug}-forgejo.${domain}`,
      svgPath: (
        <>
          <circle cx="18" cy="18" r="3" />
          <circle cx="6" cy="6" r="3" />
          <path d="M6 21V9a9 9 0 0 0 9 9" />
        </>
      ),
    },
    {
      name: "CI/CD",
      icon: "ci",
      iconClass: "service-icon-ci",
      url: `${slug}-ci.${domain}`,
      svgPath: (
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      ),
    },
    {
      name: "Dashboard",
      icon: "dashboard",
      iconClass: "service-icon-dashboard",
      url: `${slug}-headlamp.${domain}`,
      svgPath: (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </>
      ),
    },
    {
      name: "Storage",
      icon: "storage",
      iconClass: "service-icon-storage",
      url: `${slug}-minio.${domain}`,
      svgPath: (
        <>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </>
      ),
    },
    {
      name: "Console",
      icon: "console",
      iconClass: "service-icon-dashboard",
      url: `${slug}-console.${domain}`,
      svgPath: (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 8l4 4-4 4" />
          <line x1="13" y1="16" x2="17" y2="16" />
        </>
      ),
    },
  ];

  return (
    <div className="grid-2">
      {services.map((service) => (
        <a
          key={service.icon}
          href={`https://${service.url}`}
          target="_blank"
          rel="noopener noreferrer"
          className="card service-card"
        >
          <div className="service-card-header">
            <div className={`service-icon ${service.iconClass}`}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {service.svgPath}
              </svg>
            </div>
            <h3>{service.name}</h3>
          </div>
          <span className="service-card-url">{service.url}</span>
        </a>
      ))}
    </div>
  );
}

function EventsTimeline({ events }: { events: ProvisionEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted" style={{ padding: "12px 0" }}>
        No events yet.
      </p>
    );
  }

  return (
    <div className="timeline">
      {events.map((event, i) => (
        <div className="timeline-item" key={i}>
          <div
            className={`timeline-dot ${timelineDotClass(event.status)}`}
          />
          <div className="timeline-content">
            <div className="timeline-phase">{event.phase}</div>
            {event.message && (
              <div className="timeline-message">{event.message}</div>
            )}
            <div className="timeline-time">
              {formatDate(event.created_at)} at {formatTime(event.created_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function InstanceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  const customerResult = await pool.query(
    `SELECT id FROM customers WHERE user_id = $1`,
    [session.user.id]
  );

  if (customerResult.rows.length === 0) {
    redirect("/dashboard");
  }

  const instanceResult = await pool.query(
    `SELECT * FROM instances
     WHERE slug = $1 AND customer_id = $2`,
    [slug, customerResult.rows[0].id]
  );

  if (instanceResult.rows.length === 0) {
    notFound();
  }

  const instance: Instance = instanceResult.rows[0];

  const eventsResult = await pool.query(
    `SELECT phase, status, message, created_at
     FROM provision_events
     WHERE instance_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [instance.id]
  );

  const events: ProvisionEvent[] = eventsResult.rows;

  const domain = process.env.MANAGED_DOMAIN || "open-platform.sh";

  const isProvisioning =
    instance.status === "pending" || instance.status === "provisioning";
  const isReady = instance.status === "ready";

  return (
    <div className="container">
      <div style={{ marginBottom: 8 }}>
        <Link
          href="/dashboard"
          className="text-sm text-muted"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            transition: "color 0.15s",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Instances
        </Link>
      </div>

      <div className="instance-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1>{instance.display_name}</h1>
            <StatusBadge status={instance.status} />
          </div>
          <div className="instance-meta">
            <span>{instance.slug}</span>
            <span className="instance-meta-divider" />
            <span>Created {formatDate(instance.created_at)}</span>
            {instance.provisioned_at && (
              <>
                <span className="instance-meta-divider" />
                <span>
                  Provisioned {formatDate(instance.provisioned_at)}
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isReady && (
            <a
              href={`https://${slug}-console.${domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-accent btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Open Console
            </a>
          )}
          {isReady && (
            <Link
              href={`/dashboard/${slug}/terminal`}
              className="btn btn-ghost btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              Terminal
            </Link>
          )}
          <Link
            href={`/dashboard/${slug}/settings`}
            className="btn btn-ghost btn-sm"
          >
            Settings
          </Link>
        </div>
      </div>

      {isProvisioning && (
        <ProvisionTerminal
          slug={slug}
          initialEvents={events}
          instanceStatus={instance.status}
        />
      )}

      {isReady && (
        <div className="section">
          <div className="section-header">Services</div>
          <ServiceCards slug={slug} domain={domain} />
        </div>
      )}

      {isReady && <GettingStarted slug={slug} domain={domain} />}

      <div className="section" style={{ marginTop: isReady ? 16 : 0 }}>
        <div className="section-header">Events</div>
        <div className="card">
          <div className="card-body">
            <EventsTimeline events={events} />
          </div>
        </div>
      </div>
    </div>
  );
}
