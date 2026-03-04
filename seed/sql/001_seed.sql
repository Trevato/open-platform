INSERT INTO artworks (artist_username, title, description, image_url, medium, tags) VALUES
  ('ember', 'Sunset over the Forge', 'Golden light cascading over the workshop at dusk', '/placeholder.jpg', 'Digital Painting', ARRAY['landscape', 'golden-hour']),
  ('ember', 'Morning in the Bazaar', 'The marketplace awakens with early merchants', '/placeholder.jpg', 'Digital Painting', ARRAY['cityscape', 'morning']),
  ('ivory', 'The Scribe''s Desk', 'Ink, parchment, and candlelight — a writer at work', '/placeholder.jpg', 'Illustration', ARRAY['still-life', 'writing']),
  ('ivory', 'Tavern Hearth', 'Warm firelight and stories shared over ale', '/placeholder.jpg', 'Illustration', ARRAY['interior', 'cozy']),
  ('coral', 'Crystalline Dreams', 'Abstract formations of light and color', '/placeholder.jpg', 'Abstract', ARRAY['abstract', 'light']),
  ('coral', 'Storm Anvil', 'Thunderheads building over a mountain forge', '/placeholder.jpg', 'Photography', ARRAY['landscape', 'dramatic']),
  ('ember', 'The Artisan''s Hands', 'Skilled hands shaping clay on a wheel', '/placeholder.jpg', 'Photography', ARRAY['portrait', 'craft']),
  ('ivory', 'Midnight Garden', 'Bioluminescent flowers in a secret grove', '/placeholder.jpg', 'Digital Painting', ARRAY['fantasy', 'nature'])
ON CONFLICT DO NOTHING;

INSERT INTO collections (owner_username, title, description) VALUES
  ('ember', 'Landscapes of Atelier', 'Capturing the world around the guild'),
  ('ivory', 'Guild Life', 'Scenes from daily life in the Atelier')
ON CONFLICT DO NOTHING;

INSERT INTO collection_artworks (collection_id, artwork_id) VALUES
  (1, 1), (1, 2), (1, 6),
  (2, 3), (2, 4), (2, 7)
ON CONFLICT DO NOTHING;
