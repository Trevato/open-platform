import Link from "next/link";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LandingCTA } from "./components/landing-cta";
import { DeploySequence } from "./components/deploy-sequence";

export default async function LandingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="nav-brand">
          <div className="nav-brand-mark" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="4" height="4" rx="1" fill="#0f0f13" />
              <rect x="7" y="1" width="4" height="4" rx="1" fill="#0f0f13" />
              <rect x="1" y="7" width="4" height="4" rx="1" fill="#0f0f13" />
              <rect
                x="7"
                y="7"
                width="4"
                height="4"
                rx="1"
                fill="#0f0f13"
                opacity="0.4"
              />
            </svg>
          </div>
          Open Platform
        </div>
        <LandingCTA size="default" />
      </nav>

      <section className="landing-hero">
        <h1>Your platform, one dashboard</h1>
        <p>
          Git, CI/CD, databases, storage, video, and messaging — deployed
          together, managed from one place.
        </p>
        <LandingCTA size="lg" />
      </section>

      <hr className="landing-divider" />

      <section className="landing-section">
        <div className="landing-section-header">
          <h2>What you get</h2>
        </div>
        <div className="what-you-get">
          <div className="what-you-get-item">
            <h3>App template</h3>
            <p>
              Next.js with database, storage, and auth wired together. Create
              from template, push, it deploys.
            </p>
          </div>
          <div className="what-you-get-item">
            <h3>PostgreSQL</h3>
            <p>
              A database for every app. Schema applied automatically in CI. No
              setup needed.
            </p>
          </div>
          <div className="what-you-get-item">
            <h3>S3 Storage</h3>
            <p>
              S3-compatible object storage for files, images, and uploads. Works
              with any S3 client.
            </p>
          </div>
          <div className="what-you-get-item">
            <h3>Push to deploy</h3>
            <p>
              Every push builds and deploys automatically. No Docker to manage,
              no pipelines to write.
            </p>
          </div>
          <div className="what-you-get-item">
            <h3>Video meetings</h3>
            <p>
              Self-hosted Jitsi for video conferencing. No accounts needed for
              guests, SSO for your team.
            </p>
          </div>
          <div className="what-you-get-item">
            <h3>Team messaging</h3>
            <p>
              Zulip for threaded team chat. Topic-based conversations that
              scale, with full-text search.
            </p>
          </div>
          <div className="what-you-get-item">
            <h3>Preview environments</h3>
            <p>
              Open a PR, get a live preview with its own database and storage.
              Close it, everything cleans up.
            </p>
          </div>
          <div className="what-you-get-item">
            <h3>One sign-in</h3>
            <p>
              Sign in once. Git, CI, dashboard, every app you build — all
              connected through one identity.
            </p>
          </div>
          <div className="what-you-get-item">
            <h3>MCP for AI tools</h3>
            <p>
              Connect Claude, Cursor, VS Code, or any MCP client directly to
              your platform with one config.
            </p>
          </div>
        </div>
      </section>

      <hr className="landing-divider" />

      <section className="landing-section">
        <div className="landing-section-header">
          <h2>What happens when you deploy</h2>
        </div>
        <DeploySequence />
      </section>

      <footer className="landing-footer">
        <Link href="https://github.com/trevato/open-platform">GitHub</Link>
        <span aria-hidden="true">-</span>
        <Link href="https://open-platform.sh">Docs</Link>
        <span aria-hidden="true">-</span>
        <Link href="https://trevato.dev">by trevato</Link>
      </footer>
    </div>
  );
}
