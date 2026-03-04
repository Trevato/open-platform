INSERT INTO articles (author_username, title, subtitle, body, slug, status, reading_time, published_at) VALUES
  ('sage', 'The Art of Digital Craft', 'Lessons from building in a creative guild', 'In the heart of every creative community lies a tension between individual expression and collective purpose. The Atelier guild embodies this balance — each artisan brings their unique voice while contributing to something larger than themselves.

We have found that the best work emerges not from isolation, but from the gentle friction of different perspectives rubbing against each other. The Gallery shows us what is beautiful, the Forge shows us what is possible, and the Tavern reminds us that none of it matters without connection.

## The Creative Process

Every project begins as a spark — sometimes in conversation at the Tavern, sometimes while browsing the Gallery, sometimes in the quiet hours before dawn. The key is to capture these sparks before they fade.

The Forge provides the structure. Without milestones and tasks, inspiration remains forever potential. But with too much structure, the spark dies. The balance is an art in itself.', 'the-art-of-digital-craft', 'published', 3, NOW() - INTERVAL '5 days'),
  ('sage', 'Building Marketplaces That Matter', 'What the Bazaar teaches us about value', 'Value is a strange thing. In the Bazaar, we see it every day — one artisan''s cast-off materials become another''s treasured supplies. Price is the simplest measure of value, but rarely the most accurate.

The marketplace works because trust exists between its participants. Reviews and reputation create a web of accountability that makes commerce possible without contracts or intermediaries.

## Lessons for Platform Builders

If you are building a marketplace, remember: the transaction is the least interesting part. The relationships formed, the discoveries made, the problems solved — these are what keep people coming back.', 'building-marketplaces-that-matter', 'published', 2, NOW() - INTERVAL '3 days'),
  ('reed', 'A Guide to the Atelier', 'Everything newcomers need to know', 'Welcome to the Atelier. This guide will help you find your way around our five interconnected spaces.

**Gallery** — Where we share and celebrate visual work. Upload your art, curate collections, and discover inspiration.

**Scroll** — Where words live. Long-form writing for those who think in paragraphs, not tweets.

**Bazaar** — Where makers trade. List your creations, find supplies, connect with buyers.

**Forge** — Where projects take shape. Track milestones, assign tasks, collaborate with your team.

**Tavern** — Where we gather. Channels for every interest, threads for every thought.

Each space has its own personality, but they all share a common identity. Your Forgejo account works everywhere, and the navigation bar at the top will always take you where you need to go.', 'a-guide-to-the-atelier', 'published', 2, NOW() - INTERVAL '1 day'),
  ('quill', 'On the Nature of Collaboration', 'Why creative tools should talk to each other', 'The best creative tools are not islands. They are bridges.

When a Gallery artist needs to write about their process, they come to Scroll. When a Scroll writer wants to sell their zine, they list it on Bazaar. When the Bazaar community wants to plan a collective exhibition, they use Forge. And when anyone needs to just talk about it all, the Tavern is always open.

This interconnection is not accidental. It is the core design principle of the Atelier — that creativity flows more freely when barriers between tools are low and the identity layer is shared.', 'on-the-nature-of-collaboration', 'published', 2, NOW() - INTERVAL '12 hours')
ON CONFLICT (slug) DO NOTHING;
