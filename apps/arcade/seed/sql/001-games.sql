INSERT INTO games (slug, name, description, icon) VALUES
  ('snake', 'Snake', 'Classic snake game. Eat food, grow longer, dont hit walls.', '🐍'),
  ('tetris', 'Tetris', 'Stack blocks, clear lines, chase the high score.', '🧱'),
  ('breakout', 'Breakout', 'Bounce the ball, break all the bricks.', '🏓'),
  ('memory', 'Memory Match', 'Flip cards, find pairs. Fewer moves = higher score.', '🧠'),
  ('typing', 'Speed Typing', 'Type the words as fast as you can. WPM is your score.', '⌨️')
ON CONFLICT (slug) DO NOTHING;
