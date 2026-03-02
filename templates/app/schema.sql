-- Declarative schema -- applied via psql in CI pipeline
-- Add tables, indexes, and constraints here.

CREATE TABLE IF NOT EXISTS example (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
