INSERT INTO posts (author_username, body, created_at) VALUES
  ('system', 'Welcome to the social feed! This platform is self-hosted and powered by Forgejo, Woodpecker CI, and Kubernetes.', NOW() - INTERVAL '2 hours'),
  ('system', 'Every app gets its own postgres database, S3 bucket, and CI/CD pipelines automatically.', NOW() - INTERVAL '1 hour');
