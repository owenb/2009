-- Migration: 002_refactor_to_three_tier_architecture
-- Description: Refactor schema to three-tier architecture (scenes → scene_generation_attempts → prompts)

-- ============================================================================
-- STEP 1: Drop old foreign key constraints
-- ============================================================================

-- Drop FK from scenes to prompts (will be replaced with current_attempt_id)
ALTER TABLE scenes DROP CONSTRAINT IF EXISTS fk_scenes_prompt_id;

-- Drop FK from prompts to scenes (will be replaced with attempt_id)
ALTER TABLE prompts DROP CONSTRAINT IF EXISTS prompts_scene_id_fkey;

-- ============================================================================
-- STEP 2: Create scene_generation_attempts table
-- ============================================================================

CREATE TABLE scene_generation_attempts (
  id SERIAL PRIMARY KEY,

  -- Link to scene slot
  scene_id INTEGER NOT NULL REFERENCES scenes(id),

  -- Who made this attempt
  creator_address TEXT NOT NULL,
  creator_fid INTEGER,

  -- Payment verification
  transaction_hash TEXT UNIQUE,
  payment_confirmed_at TIMESTAMP,

  -- Retry window (1 hour from payment confirmation)
  retry_window_expires_at TIMESTAMP,

  -- Attempt outcome
  outcome VARCHAR(50) CHECK (outcome IN (
    'in_progress',   -- Currently attempting generation
    'succeeded',     -- Successfully generated video
    'failed',        -- Failed after retry window expired
    'abandoned'      -- User gave up before window expired
  )),

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for scene_generation_attempts
CREATE INDEX idx_scene_attempts_scene_id ON scene_generation_attempts(scene_id);
CREATE INDEX idx_scene_attempts_creator_address ON scene_generation_attempts(creator_address);
CREATE INDEX idx_scene_attempts_transaction_hash ON scene_generation_attempts(transaction_hash);
CREATE INDEX idx_scene_attempts_outcome ON scene_generation_attempts(outcome);

-- ============================================================================
-- STEP 3: Modify prompts table to reference scene_generation_attempts
-- ============================================================================

-- Add new attempt_id column (nullable initially for migration)
ALTER TABLE prompts ADD COLUMN attempt_id INTEGER;

-- Add refined_prompt_text column for GPT-4o-mini suggestions
ALTER TABLE prompts ADD COLUMN refined_prompt_text TEXT;

-- Add last_polled_at column (moved from scenes)
ALTER TABLE prompts ADD COLUMN last_polled_at TIMESTAMP;

-- Rename scene_id to old_scene_id for migration (can be dropped later if needed)
ALTER TABLE prompts RENAME COLUMN scene_id TO old_scene_id;

-- Update constraint on prompts.old_scene_id to be nullable
ALTER TABLE prompts ALTER COLUMN old_scene_id DROP NOT NULL;

-- Add foreign key constraint for attempt_id
ALTER TABLE prompts ADD CONSTRAINT fk_prompts_attempt_id
  FOREIGN KEY (attempt_id) REFERENCES scene_generation_attempts(id);

-- Update index
DROP INDEX IF EXISTS idx_prompts_scene_id;
CREATE INDEX idx_prompts_attempt_id ON prompts(attempt_id);
CREATE INDEX idx_prompts_last_polled_at ON prompts(last_polled_at);

-- ============================================================================
-- STEP 4: Modify scenes table structure
-- ============================================================================

-- Add UNIQUE constraint on (parent_id, slot) - the atomic lock mechanism
ALTER TABLE scenes ADD CONSTRAINT unique_parent_slot UNIQUE (parent_id, slot);

-- Add new columns
ALTER TABLE scenes ADD COLUMN current_attempt_id INTEGER;

-- Remove old prompt_id column (replaced by current_attempt_id)
ALTER TABLE scenes DROP COLUMN IF EXISTS prompt_id;

-- Move transaction_hash from scenes to scene_generation_attempts (keep for now, can be deprecated)
-- Note: transaction_hash stays in scenes for backward compatibility during transition

-- Update status enum to new values
ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_status_check;
ALTER TABLE scenes ADD CONSTRAINT scenes_status_check CHECK (status IN (
  'locked',              -- Reserved, awaiting payment
  'verifying_payment',   -- Payment tx received, verifying on-chain
  'awaiting_prompt',     -- Payment confirmed, waiting for prompt
  'generating',          -- Video generation in progress
  'completed',           -- Video successfully generated
  'failed',              -- Generation failed after retry window
  'lock_expired'         -- Lock expired without payment
));

-- Update indexes for scenes
CREATE INDEX IF NOT EXISTS idx_scenes_current_attempt_id ON scenes(current_attempt_id);

-- Add FK constraint from scenes.current_attempt_id to scene_generation_attempts
ALTER TABLE scenes ADD CONSTRAINT fk_scenes_current_attempt_id
  FOREIGN KEY (current_attempt_id) REFERENCES scene_generation_attempts(id);

-- ============================================================================
-- STEP 5: Data migration (if any existing data exists)
-- ============================================================================

-- Note: If there are existing scenes with status='completed', you may need to:
-- 1. Create scene_generation_attempts rows for them
-- 2. Update prompts.attempt_id to reference the new attempts
-- 3. Update scenes.current_attempt_id to reference the attempts
-- This migration assumes a fresh database or handles this in application code

-- ============================================================================
-- NOTES
-- ============================================================================

-- After this migration:
-- 1. scenes.transaction_hash is deprecated (moved to scene_generation_attempts)
-- 2. prompts.old_scene_id can be dropped in a future migration after data verification
-- 3. The three-tier hierarchy is: scenes → scene_generation_attempts → prompts
-- 4. UNIQUE(parent_id, slot) provides atomic lock mechanism
-- 5. Multiple attempts can exist per scene_id if locks expire/fail
