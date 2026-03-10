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
              <rect x="7" y="7" width="4" height="4" rx="1" fill="#0f0f13" opacity="0.4" />
            </svg>
          </div>
          Open Platform
        </div>
        <LandingCTA size="default" />
      </nav>

      <section className="landing-hero">
        <h1>Your developer platform in minutes</h1>
        <p>
          Database, storage, CI/CD, and Git — deployed together,
          wired together, ready to build on.
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
              Next.js with database, storage, and auth wired together.
              Create from template, push, it deploys.
            </p>
          </div>
          <div className="what-you-get-item">
            <h3>PostgreSQL</h3>
            <p>
              A database for every app. Schema applied automatically
              in CI. No setup needed.
            </p>
          </div>
          <div className="what-you-get-item">
            <h3>S3 Storage</h3>
            <p>
              S3-compatible object storage for files, images, and
              uploads. Works with any S3 client.
            </p>
          </div>
          <div className="what-you-get-item">
            <h3>Push to deploy</h3>
            <p>
              Every push builds and deploys automatically. No Docker
              to manage, no pipelines to write.
            </p>
          </div>
          <div className="what-you-get-item">
            <h3>Preview environments</h3>
            <p>
              Open a PR, get a live preview with its own database and
              storage. Close it, everything cleans up.
            </p>
          </div>
          <div className="what-you-get-item">
            <h3>One sign-in</h3>
            <p>
              Sign in once. Git, CI, dashboard, every app you
              build — all connected through one identity.
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

      <hr className="landing-divider" />

      <section className="landing-section">
        <div className="landing-section-header">
          <h2>Simple pricing</h2>
          <p>Start free. Scale when you need to.</p>
        </div>
        <div className="grid-3">
          <div className="card pricing-card">
            <div className="pricing-tier">Free</div>
            <div className="pricing-price">
              $0<span> /mo</span>
            </div>
            <ul className="pricing-features">
              <li>1 platform instance</li>
              <li>Database per app</li>
              <li>Preview environments</li>
              <li>Single sign-on</li>
              <li>Community support</li>
            </ul>
            <LandingCTA size="default" variant="ghost" />
          </div>
          <div className="card pricing-card pricing-card-featured">
            <div className="pricing-tier">Pro</div>
            <div className="pricing-price">
              $29<span> /mo</span>
            </div>
            <ul className="pricing-features">
              <li>3 platform instances</li>
              <li>Database per app</li>
              <li>Preview environments</li>
              <li>Custom domains</li>
              <li>2 CPU / 8Gi per instance</li>
              <li>Priority support</li>
            </ul>
            <LandingCTA size="default" />
          </div>
          <div className="card pricing-card">
            <div className="pricing-tier">Team</div>
            <div className="pricing-price">
              $99<span> /mo</span>
            </div>
            <ul className="pricing-features">
              <li>10 platform instances</li>
              <li>Database per app</li>
              <li>Preview environments</li>
              <li>Custom domains</li>
              <li>4 CPU / 16Gi per instance</li>
              <li>Dedicated support</li>
            </ul>
            <LandingCTA size="default" variant="ghost" />
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <Link href="https://github.com/trevato/open-platform">
          GitHub
        </Link>
        <span aria-hidden="true">-</span>
        <Link href="https://open-platform.sh">
          Docs
        </Link>
        <span aria-hidden="true">-</span>
        <Link href="https://trevato.dev">
          by trevato
        </Link>
      </footer>
    </div>
  );
}
