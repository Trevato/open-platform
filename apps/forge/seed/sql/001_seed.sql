INSERT INTO projects (owner_username, title, description, status) VALUES
  ('anvil', 'Atelier Platform v2', 'Next iteration of the creative guild platform — performance improvements, new features, better cross-app integration.', 'active'),
  ('steel', 'Guild Exhibition', 'Planning the first cross-app exhibition showcasing work from all five Atelier spaces.', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO milestones (project_id, title, description, due_date, status) VALUES
  (1, 'Foundation', 'Core API routes and database schemas for all apps', NOW() + INTERVAL '2 weeks', 'open'),
  (1, 'UI Polish', 'Responsive layouts, animations, accessibility', NOW() + INTERVAL '4 weeks', 'open'),
  (2, 'Curation', 'Select and prepare works for the exhibition', NOW() + INTERVAL '1 week', 'open'),
  (2, 'Launch', 'Go live with the exhibition page', NOW() + INTERVAL '3 weeks', 'open')
ON CONFLICT DO NOTHING;

INSERT INTO tasks (project_id, milestone_id, title, description, assignee_username, status, priority) VALUES
  (1, 1, 'Gallery API routes', 'Implement CRUD for artworks and collections', 'ember', 'done', 'high'),
  (1, 1, 'Scroll API routes', 'Implement CRUD for articles and reading lists', 'sage', 'done', 'high'),
  (1, 1, 'Bazaar API routes', 'Implement CRUD for listings and reviews', 'copper', 'done', 'high'),
  (1, 1, 'Forge API routes', 'Implement CRUD for projects, milestones, and tasks', 'anvil', 'in_progress', 'high'),
  (1, 1, 'Tavern API routes', 'Implement CRUD for channels, threads, and replies', 'oak', 'in_progress', 'high'),
  (1, 2, 'Gallery masonry grid', 'Responsive image grid with lightbox', 'ivory', 'todo', 'medium'),
  (1, 2, 'Scroll article reader', 'Clean reading experience with typography', 'reed', 'todo', 'medium'),
  (1, 2, 'Forge kanban board', 'Drag-and-drop task columns', 'bolt', 'todo', 'medium'),
  (2, 3, 'Select Gallery works', 'Choose 10 artworks for the exhibition', 'ivory', 'todo', 'medium'),
  (2, 3, 'Write exhibition catalog', 'Short descriptions for each selected work', 'quill', 'todo', 'low')
ON CONFLICT DO NOTHING;

INSERT INTO project_members (project_id, username, role) VALUES
  (1, 'anvil', 'owner'),
  (1, 'steel', 'admin'),
  (1, 'bolt', 'member'),
  (2, 'steel', 'owner'),
  (2, 'ivory', 'member'),
  (2, 'quill', 'member')
ON CONFLICT DO NOTHING;

INSERT INTO task_comments (task_id, author_username, body) VALUES
  (4, 'steel', 'Looking good so far. Make sure the task board supports drag-and-drop later.'),
  (1, 'anvil', 'Merged! Gallery API is live.')
ON CONFLICT DO NOTHING;
