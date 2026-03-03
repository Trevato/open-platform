INSERT INTO games (slug, name, description, icon, max_score) VALUES
  ('snake', 'Snake', 'Arrow keys to move. Eat food, grow longer, avoid walls and yourself.', '🐍', 397),
  ('tetris', 'Tetris', 'Arrows to move, Up to rotate, Space to drop. Clear lines, chase the high score.', '🧱', NULL),
  ('breakout', 'Breakout', 'Mouse or arrows to move paddle. Break bricks, build combos, survive.', '🏓', NULL),
  ('memory', 'Memory Match', 'Click cards to flip them. Find all pairs fast for the highest score.', '🧠', 1000),
  ('typing', 'Speed Typing', 'Type the words as fast and accurately as you can. 30 seconds on the clock.', '⌨️', NULL)
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  max_score = EXCLUDED.max_score;
