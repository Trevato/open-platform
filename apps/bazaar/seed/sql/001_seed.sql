INSERT INTO listings (seller_username, title, description, price, category, condition) VALUES
  ('copper', 'Artisan Brush Set', 'Hand-crafted brushes for digital and traditional painting. Set of 12 with bamboo handles.', 45.00, 'Art Supplies', 'new'),
  ('copper', 'Leather-Bound Sketchbook', 'A5 sketchbook with 200gsm acid-free paper. 120 pages.', 28.00, 'Art Supplies', 'new'),
  ('jade', 'Vintage Ink Collection', 'Set of 6 botanical-based inks in glass bottles. Rich, archival pigments.', 62.00, 'Art Supplies', 'new'),
  ('pearl', 'Writing Desk Lamp', 'Adjustable brass desk lamp with warm LED. Perfect for late-night writing sessions.', 89.00, 'Studio Equipment', 'like_new'),
  ('jade', 'Font Specimen Book', 'Printed collection of 100 typefaces with usage examples. Hardcover.', 35.00, 'Books', 'new'),
  ('copper', 'Digital Tablet Stand', 'Ergonomic aluminum stand for drawing tablets. Adjustable angle 15-75 degrees.', 55.00, 'Studio Equipment', 'new')
ON CONFLICT DO NOTHING;

INSERT INTO reviews (reviewer_username, seller_username, rating, comment) VALUES
  ('jade', 'copper', 5, 'Beautiful brushes — the bamboo handles are a nice touch.'),
  ('pearl', 'jade', 4, 'Great inks, though one bottle arrived with a slightly loose cap.')
ON CONFLICT DO NOTHING;
