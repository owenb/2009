-- Migration 006: Add movies table and movie_id to scenes
-- Transforms the platform from single-narrative to multi-movie platform

-- Step 1: Create movies table (without genesis_scene_id FK initially due to circular dependency)
CREATE TABLE movies (
  id SERIAL PRIMARY KEY,

  -- URL identifier (permanent, immutable once approved)
  slug TEXT UNIQUE NOT NULL,

  -- Movie metadata
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  genre TEXT,
  themes TEXT[], -- Array of theme strings
  content_guidelines TEXT,

  -- Creator (the "Hollywood producer" who launched this movie)
  creator_address TEXT NOT NULL,
  creator_fid INTEGER,
  creator_display_name TEXT,

  -- Genesis scene (will add FK constraint later)
  genesis_scene_id INTEGER,

  -- Economics
  deposit_amount_wei NUMERIC(78, 0), -- 1-2 ETH deposit paid upfront
  scene_price_wei NUMERIC(78, 0), -- NULL = use platform default (0.007 ETH)

  -- Status
  status VARCHAR(50) CHECK (status IN (
    'draft',      -- Being set up (not visible to users)
    'active',     -- Live and accepting scene contributions
    'paused',     -- Temporarily disabled by creator or platform
    'archived'    -- No longer accepting new scenes (viewable only)
  )) DEFAULT 'draft',

  -- Stats (for discovery/ranking)
  total_scenes INTEGER DEFAULT 4, -- Starts with 4 (genesis + 3 pre-generated)
  total_views INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 2: Add indexes for movies table
CREATE INDEX idx_movies_slug ON movies(slug);
CREATE INDEX idx_movies_creator_address ON movies(creator_address);
CREATE INDEX idx_movies_status ON movies(status);
CREATE INDEX idx_movies_genre ON movies(genre);
CREATE INDEX idx_movies_genesis_scene_id ON movies(genesis_scene_id);

-- Step 3: Add movie_id column to scenes (nullable initially)
ALTER TABLE scenes ADD COLUMN movie_id INTEGER REFERENCES movies(id);

-- Step 4: Create the inaugural "2009" movie
-- Using platform address as creator (can be updated later)
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
  total_scenes
) VALUES (
  '2009',
  '2009: Bitcoin Genesis',
  'The first Bitcoin block was mined on 3 January 2009. Travel back to this pivotal moment and explore alternate timelines where cryptocurrency could have evolved differently.',
  'sci-fi',
  ARRAY['decentralization', 'time travel', 'alternate history', 'cryptocurrency'],
  'PG-13, philosophical tone, no graphic violence',
  '0x0000000000000000000000000000000000000000', -- Placeholder, update with actual platform address
  'Platform',
  'active',
  (SELECT COUNT(*) FROM scenes) -- Count existing scenes
);

-- Step 5: Update all existing scenes to belong to the "2009" movie
UPDATE scenes SET movie_id = (SELECT id FROM movies WHERE slug = '2009');

-- Step 6: Make movie_id NOT NULL now that all scenes have been updated
ALTER TABLE scenes ALTER COLUMN movie_id SET NOT NULL;

-- Step 7: Add index for scenes.movie_id
CREATE INDEX idx_scenes_movie_id ON scenes(movie_id);

-- Step 8: Add FK constraint from movies.genesis_scene_id to scenes.id
ALTER TABLE movies
  ADD CONSTRAINT fk_movies_genesis_scene_id
  FOREIGN KEY (genesis_scene_id) REFERENCES scenes(id);

-- Step 9: Set the genesis_scene_id for the "2009" movie
-- Assumes scene with id=1 is the genesis (update if different)
UPDATE movies
SET genesis_scene_id = (SELECT id FROM scenes WHERE parent_id IS NULL ORDER BY id LIMIT 1)
WHERE slug = '2009';

-- Migration complete!
-- The platform now supports multiple movies, with "2009" as the inaugural movie.
