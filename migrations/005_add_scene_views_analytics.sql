-- Migration: Add scene_views table for analytics tracking
-- Created: 2025-10-18
-- Purpose: Track individual user clicks/views on scenes to analyze engagement and user journeys

CREATE TABLE scene_views (
  id SERIAL PRIMARY KEY,

  -- Which scene was viewed
  scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,

  -- Who viewed it
  viewer_address TEXT,     -- Wallet address (null if not connected)
  viewer_fid INTEGER,      -- Farcaster ID (null if not available)

  -- Session tracking (client-generated UUID to group user's exploration session)
  session_id UUID NOT NULL,

  -- When it was viewed
  viewed_at TIMESTAMP DEFAULT NOW(),

  -- Optional: Track referrer for path analysis
  referrer_scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX idx_scene_views_scene_id ON scene_views(scene_id);
CREATE INDEX idx_scene_views_viewer_address ON scene_views(viewer_address);
CREATE INDEX idx_scene_views_session_id ON scene_views(session_id);
CREATE INDEX idx_scene_views_viewed_at ON scene_views(viewed_at);
CREATE INDEX idx_scene_views_referrer_scene_id ON scene_views(referrer_scene_id);

-- Composite index for common analytics queries (views per scene over time)
CREATE INDEX idx_scene_views_scene_viewed ON scene_views(scene_id, viewed_at DESC);

-- Composite index for user journey analysis
CREATE INDEX idx_scene_views_session_viewed ON scene_views(session_id, viewed_at);

-- Add view_count to scenes table for quick aggregate access
ALTER TABLE scenes ADD COLUMN view_count INTEGER DEFAULT 0;

-- Backfill existing scenes with 0 views
UPDATE scenes SET view_count = 0 WHERE view_count IS NULL;
