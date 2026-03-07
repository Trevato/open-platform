import Link from "next/link";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LandingCTA } from "./components/landing-cta";

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
          Git hosting, CI/CD, Kubernetes dashboard, and object storage.
          One click. Fully managed.
        </p>
        <LandingCTA size="lg" />
      </section>

      <hr className="landing-divider" />

      <section className="landing-section">
        <div className="landing-section-header">
          <h2>Everything you need to ship</h2>
          <p>Four services, one platform, zero ops.</p>
        </div>
        <div className="grid-2">
          <div className="card feature-card">
            <div className="feature-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="18" r="3" />
                <circle cx="6" cy="6" r="3" />
                <path d="M6 21V9a9 9 0 0 0 9 9" />
              </svg>
            </div>
            <h3>Git and Code</h3>
            <p>
              Forgejo-powered Git hosting with issues, pull requests,
              and a container registry. Your code, your server.
            </p>
          </div>
          <div className="card feature-card">
            <div className="feature-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <h3>CI/CD Pipelines</h3>
            <p>
              Woodpecker CI builds and deploys on every push. Preview
              environments for pull requests. Zero config.
            </p>
          </div>
          <div className="card feature-card">
            <div className="feature-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            </div>
            <h3>Kubernetes Dashboard</h3>
            <p>
              Headlamp gives you full visibility into your cluster.
              Pods, deployments, logs — all in the browser.
            </p>
          </div>
          <div className="card feature-card">
            <div className="feature-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <h3>Object Storage</h3>
            <p>
              S3-compatible MinIO for files, assets, and backups.
              Works with any S3 client or SDK.
            </p>
          </div>
        </div>
      </section>

      <hr className="landing-divider" />

      <section className="landing-section">
        <div className="landing-section-header">
          <h2>Three steps to running</h2>
        </div>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <h3>Sign up</h3>
            <p>Authenticate with your GitHub account</p>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <h3>Name your platform</h3>
            <p>Pick a slug for your deployment</p>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <h3>Start building</h3>
            <p>Push code. Everything else is handled.</p>
          </div>
        </div>
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
              <li>1 instance</li>
              <li>500m CPU</li>
              <li>2Gi memory</li>
              <li>10Gi storage</li>
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
              <li>3 instances</li>
              <li>2 CPU per instance</li>
              <li>8Gi memory per instance</li>
              <li>50Gi storage</li>
              <li>Custom domains</li>
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
              <li>10 instances</li>
              <li>4 CPU per instance</li>
              <li>16Gi memory per instance</li>
              <li>200Gi storage</li>
              <li>Custom domains</li>
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
