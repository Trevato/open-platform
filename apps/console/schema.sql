-- Declarative schema -- applied via psql in CI pipeline

-- better-auth tables (do not modify column names)
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"(id)
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"(id),
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Console app tables

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  github_username TEXT,
  tier TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'pending',
  admin_username TEXT NOT NULL DEFAULT 'opadmin',
  admin_email TEXT NOT NULL,
  admin_password TEXT,
  custom_domain TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  provisioned_at TIMESTAMPTZ,
  password_reset_at TIMESTAMPTZ,
  last_healthy_at TIMESTAMPTZ
);

-- Ensure columns added after initial schema are present
ALTER TABLE instances ADD COLUMN IF NOT EXISTS admin_password TEXT;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS password_reset_at TIMESTAMPTZ;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS kubeconfig TEXT;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS cluster_ip TEXT;

CREATE TABLE IF NOT EXISTS provision_events (
  id SERIAL PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'info',
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
