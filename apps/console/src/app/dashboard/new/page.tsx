"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export default function NewInstancePage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [tier, setTier] = useState("free");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const effectiveEmail =
    adminEmail || (emailTouched ? "" : session?.user?.email || "");

  const handleNameChange = useCallback(
    (value: string) => {
      setDisplayName(value);
      if (!slugTouched) {
        setSlug(slugify(value));
      }
      setFieldErrors((prev) => ({ ...prev, name: "" }));
    },
    [slugTouched]
  );

  const handleSlugChange = useCallback((value: string) => {
    setSlugTouched(true);
    setSlug(slugify(value));
    setFieldErrors((prev) => ({ ...prev, slug: "" }));
  }, []);

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!displayName || displayName.length < 2 || displayName.length > 64) {
      errors.name = "Name must be 2-64 characters";
    }

    if (!slug || !/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) {
      errors.slug =
        "3-32 characters, lowercase letters, numbers, hyphens. Must start with a letter.";
    }

    const email = effectiveEmail;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Valid email required";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [displayName, slug, effectiveEmail]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!validate()) return;

      setSubmitting(true);

      try {
        const res = await fetch("/api/instances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            display_name: displayName,
            admin_email: effectiveEmail,
            tier,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Something went wrong");
          setSubmitting(false);
          return;
        }

        router.push(`/dashboard/${slug}`);
      } catch {
        setError("Network error. Please try again.");
        setSubmitting(false);
      }
    },
    [slug, displayName, effectiveEmail, tier, validate, router]
  );

  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Create a new platform
        </h1>
        <p className="text-secondary" style={{ fontSize: 14, marginTop: 4 }}>
          Your platform will be provisioned with Git, CI/CD, a Kubernetes
          dashboard, and object storage.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div
          style={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          <div className="form-group">
            <label htmlFor="display-name" className="form-label">
              Platform name
            </label>
            <input
              id="display-name"
              type="text"
              className={`input ${fieldErrors.name ? "input-error" : ""}`}
              placeholder="My Platform"
              value={displayName}
              onChange={(e) => handleNameChange(e.target.value)}
              maxLength={64}
              autoFocus
            />
            {fieldErrors.name && (
              <p className="form-error">{fieldErrors.name}</p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="slug" className="form-label">
              Slug
            </label>
            <input
              id="slug"
              type="text"
              className={`input ${fieldErrors.slug ? "input-error" : ""}`}
              placeholder="my-platform"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              maxLength={32}
            />
            <p className="form-hint">
              {slug
                ? `Your services at ${slug}-forgejo.${process.env.NEXT_PUBLIC_MANAGED_DOMAIN || "open-platform.sh"}, etc.`
                : "Used in URLs and resource names"}
            </p>
            {fieldErrors.slug && (
              <p className="form-error">{fieldErrors.slug}</p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="admin-email" className="form-label">
              Admin email
            </label>
            <input
              id="admin-email"
              type="email"
              className={`input ${fieldErrors.email ? "input-error" : ""}`}
              placeholder={session?.user?.email || "you@example.com"}
              value={emailTouched ? adminEmail : ""}
              onChange={(e) => {
                setEmailTouched(true);
                setAdminEmail(e.target.value);
                setFieldErrors((prev) => ({ ...prev, email: "" }));
              }}
              onFocus={() => {
                if (!emailTouched && session?.user?.email) {
                  setEmailTouched(true);
                  setAdminEmail(session.user.email);
                }
              }}
            />
            {!emailTouched && session?.user?.email && (
              <p className="form-hint">
                Defaults to {session.user.email}
              </p>
            )}
            {fieldErrors.email && (
              <p className="form-error">{fieldErrors.email}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Resource tier</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { value: "free", label: "Free", desc: "500m CPU, 2Gi RAM, 10Gi storage" },
                { value: "pro", label: "Pro", desc: "2 CPU, 8Gi RAM, 50Gi storage" },
                { value: "team", label: "Team", desc: "4 CPU, 16Gi RAM, 100Gi storage" },
              ].map((t) => (
                <label
                  key={t.value}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: "var(--radius-btn)",
                    border: `1px solid ${tier === t.value ? "var(--accent)" : "var(--border)"}`,
                    background: tier === t.value ? "rgba(99,179,237,0.04)" : "transparent",
                    cursor: "pointer",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  <input
                    type="radio"
                    name="tier"
                    value={t.value}
                    checked={tier === t.value}
                    onChange={(e) => setTier(e.target.value)}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{t.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      {t.desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: "12px 16px",
                background: "var(--danger-bg)",
                border: "1px solid var(--danger-border)",
                borderRadius: "var(--radius-btn)",
                fontSize: 13,
                color: "var(--danger)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-accent"
            disabled={submitting}
            style={{ marginTop: 4 }}
          >
            {submitting && <span className="spinner spinner-sm" />}
            {submitting ? "Creating..." : "Create Platform"}
          </button>
        </div>
      </form>
    </div>
  );
}
