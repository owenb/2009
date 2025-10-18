-- Migration: 001_initial_schema
-- Description: Create scenes and prompts tables

-- Create scenes table
CREATE TABLE IF NOT EXISTS scenes (
  id SERIAL PRIMARY KEY,

  -- Tree structure
  parent_id INTEGER REFERENCES scenes(id),
  slot CHAR(1) CHECK (slot IN ('A', 'B', 'C')),

  -- Video data (URL derived from scene ID: [id].mp4)
  prompt_id INTEGER,
  video_job_id TEXT,

  -- Creator information
  creator_address TEXT,
  creator_fid INTEGER,

  -- Blockchain payment proof
  transaction_hash TEXT UNIQUE,

  -- Status tracking
  status VARCHAR(50) CHECK (status IN (
    'pending_payment',
    'generating',
    'completed',
    'failed',
    'moderation_rejected',
    'rate_limited',
    'api_error',
    'timeout'
  )),
  error_message TEXT,
  last_polled_at TIMESTAMP,

  -- Lock mechanism (pre purchase lock)
  locked_until TIMESTAMP,
  locked_by_address TEXT,
  locked_by_fid INTEGER,

  -- Retry tracking
  generation_attempts INTEGER DEFAULT 0,
  first_attempt_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create prompts table
CREATE TABLE IF NOT EXISTS prompts (
  id SERIAL PRIMARY KEY,

  -- Link to scene
  scene_id INTEGER NOT NULL REFERENCES scenes(id),

  -- Prompt content
  prompt_text TEXT NOT NULL,

  -- Video generation tracking
  video_job_id TEXT,

  -- Outcome tracking
  outcome VARCHAR(50) CHECK (outcome IN (
    'pending',
    'generating',
    'success',
    'moderation_rejected',
    'rate_limited',
    'api_error',
    'timeout',
    'abandoned'
  )),
  error_message TEXT,

  -- Timestamps
  submitted_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Add foreign key constraint after prompts table exists
ALTER TABLE scenes
  ADD CONSTRAINT fk_scenes_prompt_id
  FOREIGN KEY (prompt_id) REFERENCES prompts(id);

-- Create indexes for scenes
CREATE INDEX IF NOT EXISTS idx_scenes_parent_id ON scenes(parent_id);
CREATE INDEX IF NOT EXISTS idx_scenes_slot ON scenes(slot);
CREATE INDEX IF NOT EXISTS idx_scenes_status ON scenes(status);
CREATE INDEX IF NOT EXISTS idx_scenes_locked_until ON scenes(locked_until);
CREATE INDEX IF NOT EXISTS idx_scenes_transaction_hash ON scenes(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_scenes_prompt_id ON scenes(prompt_id);
CREATE INDEX IF NOT EXISTS idx_scenes_video_job_id ON scenes(video_job_id);

-- Create indexes for prompts
CREATE INDEX IF NOT EXISTS idx_prompts_scene_id ON prompts(scene_id);
CREATE INDEX IF NOT EXISTS idx_prompts_video_job_id ON prompts(video_job_id);
CREATE INDEX IF NOT EXISTS idx_prompts_outcome ON prompts(outcome);

-- Insert genesis scene (intro video)
INSERT INTO scenes (
  id,
  parent_id,
  slot,
  status,
  created_at
) VALUES (
  1,
  NULL,
  NULL,
  'completed',
  NOW()
) ON CONFLICT (id) DO NOTHING;
