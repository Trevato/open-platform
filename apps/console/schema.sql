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

-- Platform mode tables (per-platform console)

CREATE TABLE IF NOT EXISTS platform (
  id TEXT PRIMARY KEY DEFAULT 'default',
  domain TEXT NOT NULL,
  tls_mode TEXT NOT NULL DEFAULT 'selfsigned',
  admin_username TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  setup_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hosted mode tables (multi-tenant console)

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
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
  kubeconfig TEXT,
  cluster_ip TEXT,
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

-- Dev pods (platform + instance scoped)

CREATE TABLE IF NOT EXISTS dev_pods (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  forgejo_username TEXT NOT NULL,
  instance_slug TEXT,
  status TEXT NOT NULL DEFAULT 'stopped',
  pod_name TEXT NOT NULL,
  pvc_name TEXT NOT NULL,
  cpu_limit TEXT NOT NULL DEFAULT '2000m',
  memory_limit TEXT NOT NULL DEFAULT '4Gi',
  storage_size TEXT NOT NULL DEFAULT '20Gi',
  last_activity_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_pods_user_id ON dev_pods(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_pods_username_instance ON dev_pods(forgejo_username, COALESCE(instance_slug, ''));
CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_pods_podname_instance ON dev_pods(pod_name, COALESCE(instance_slug, ''));

-- Agents (AI agents with Forgejo identities)

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
  instructions TEXT,
  allowed_tools TEXT[],
  forgejo_username TEXT NOT NULL,
  forgejo_token TEXT NOT NULL,
  orgs TEXT[] NOT NULL DEFAULT '{}',
  schedule TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  max_steps INTEGER NOT NULL DEFAULT 25,
  last_activity_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_slug ON agents(slug);
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_instances_customer_id ON instances(customer_id);
CREATE INDEX IF NOT EXISTS idx_instances_slug ON instances(slug);
CREATE INDEX IF NOT EXISTS idx_provision_events_instance_id ON provision_events(instance_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
