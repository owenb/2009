-- Migration 007: Add color_scheme column to movies table
-- Enables per-movie color customization for Tailwind theming

-- Step 1: Add color_scheme JSONB column to movies table
ALTER TABLE movies ADD COLUMN color_scheme JSONB;

-- Step 2: Add default color scheme for the "2009" movie (gold/orange theme)
UPDATE movies
SET color_scheme = '{
  "primary": "#FFD700",
  "secondary": "#FFA500",
  "accent": "#FF6B35",
  "bg": "#0a0a0a",
  "bgOverlay": "rgba(0, 0, 0, 0.85)",
  "text": "#ffffff",
  "textMuted": "rgba(255, 255, 255, 0.85)"
}'::jsonb
WHERE slug = '2009';

-- Migration complete!
-- Movies can now have custom color schemes that will be injected as CSS variables.
