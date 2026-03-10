/**
 * URL builders and config for E2E tests.
 *
 * Env vars:
 *   PLATFORM_DOMAIN   - e.g. "open-platform.sh" or "product-garden.com"
 *   SERVICE_PREFIX     - e.g. "buster-" (includes trailing dash) or "" for host
 *   FORGEJO_ADMIN_USER - admin username (default: opadmin)
 *   FORGEJO_ADMIN_PASSWORD - admin password
 */

export const domain = process.env.PLATFORM_DOMAIN || "open-platform.sh";
export const prefix = process.env.SERVICE_PREFIX || "";

export function serviceUrl(service: string): string {
  return `https://${prefix}${service}.${domain}`;
}

export const urls = {
  forgejo: serviceUrl("forgejo"),
  ci: serviceUrl("ci"),
  headlamp: serviceUrl("headlamp"),
  minio: serviceUrl("minio"),
  s3: serviceUrl("s3"),
  oauth2: serviceUrl("oauth2"),
};

export const admin = {
  username: process.env.FORGEJO_ADMIN_USER || "opadmin",
  password: process.env.FORGEJO_ADMIN_PASSWORD || "",
};
