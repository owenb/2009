-- Migration 008: Add Mochi's Double Life movie
-- The second movie on the platform: A pink bunny discovers economic freedom

-- Insert the Mochi movie
INSERT INTO movies (
  slug,
  title,
  description,
  genre,
  themes,
  content_guidelines,
  creator_address,
  creator_display_name,
  status,
  total_scenes,
  color_scheme
) VALUES (
  'mochi',
  'Mochi''s Double Life',
  'Mochi, an anxious pink bunny working at the Central Burrow Bank, discovers a secret underground economy where trust replaces vouchers. As she navigates two worlds, she must choose between the safety of the system and the freedom of community.',
  'fantasy',
  ARRAY['economic freedom', 'trust systems', 'personal growth', 'community', 'alternative economies'],
  'PG, whimsical but sophisticated, suitable for all ages with adult themes',
  '0x0000000000000000000000000000000000000000', -- Placeholder platform address
  'Platform',
  'active',
  0, -- Start with 0 scenes (genesis will be added separately)
  '{
    "primary": "#FFB3D9",
    "secondary": "#E6C4C9",
    "accent": "#F4C542",
    "bg": "#2A1A2E",
    "bgOverlay": "#1A0F1E",
    "text": "#FFFFFF",
    "textMuted": "#D4A5B8"
  }'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- Migration complete!
-- The Mochi movie has been added and is ready for genesis scene creation.
