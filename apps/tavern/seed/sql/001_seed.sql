INSERT INTO channels (name, description, icon, sort_order) VALUES
  ('general', 'Welcome to the Atelier! Introduce yourself and chat about anything.', '🏠', 1),
  ('gallery-talk', 'Discuss art, share techniques, give feedback on Gallery uploads.', '🎨', 2),
  ('marketplace', 'Bazaar discussions — deals, requests, seller tips.', '🏪', 3)
ON CONFLICT (name) DO NOTHING;

INSERT INTO threads (channel_id, author_username, title, body, is_pinned, reply_count) VALUES
  (1, 'oak', 'Welcome to the Tavern!', 'This is the community gathering place for the Atelier guild. Pull up a chair, grab a drink, and introduce yourself. We are artisans, writers, builders, and traders — but most of all, we are a community.

**A few ground rules:**
- Be kind and constructive
- Share your work proudly
- Help newcomers find their way
- Have fun!', true, 2),
  (2, 'flint', 'Weekly Art Challenge: "Light and Shadow"', 'This week''s theme is **Light and Shadow**. Upload your interpretation to the Gallery and share the link here. All mediums welcome — digital, traditional, photography, whatever speaks to you.

Deadline: end of the week. We will feature the best entries on the Gallery homepage!', false, 1),
  (3, 'wren', 'Looking for: Calligraphy supplies', 'Does anyone in the Bazaar have calligraphy pens or nibs? Ideally a starter set for someone just getting into the craft. Budget is around 30 credits.', false, 1)
ON CONFLICT DO NOTHING;

INSERT INTO replies (thread_id, author_username, body) VALUES
  (1, 'flint', 'Great to be here! I am mostly a UI designer but I dabble in illustration. Looking forward to sharing work on the Gallery.'),
  (1, 'wren', 'Hello everyone! I am a writer — you will find me mostly on Scroll. But the Tavern is where the real conversations happen.'),
  (2, 'oak', 'Love this idea. I have been experimenting with chiaroscuro techniques — this is the perfect excuse to finish that piece.'),
  (3, 'flint', 'I saw copper listed a brush set that includes some calligraphy brushes. Check the Bazaar under Art Supplies!')
ON CONFLICT DO NOTHING;
