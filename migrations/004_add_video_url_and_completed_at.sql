-- Migration 004: Add video_url and completed_at columns to scenes table
-- These columns are needed for the generation completion flow

-- Add video_url column to store the R2 URL of the completed video
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Add completed_at timestamp for when the scene was successfully generated
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Add index for fast lookups of completed scenes
CREATE INDEX IF NOT EXISTS idx_scenes_video_url ON scenes(video_url) WHERE video_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scenes_completed_at ON scenes(completed_at) WHERE completed_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN scenes.video_url IS 'Public R2 URL of the generated video (e.g., https://scenes.domain.com/42.mp4)';
COMMENT ON COLUMN scenes.completed_at IS 'Timestamp when video generation completed and was uploaded to R2';
