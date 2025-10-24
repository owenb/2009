-- Migration 010: Escrow Flow Updates
-- Date: 2025-10-24

BEGIN;

-- 1. Add awaiting_confirmation status
ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_status_check;
ALTER TABLE scenes ADD CONSTRAINT scenes_status_check CHECK (status IN (
  'locked',              -- Payment pending (1-minute lock)
  'verifying_payment',   -- Checking blockchain tx
  'awaiting_prompt',     -- Payment verified, needs prompt
  'generating',          -- Video generation in progress
  'awaiting_confirmation', -- NEW: Video ready, needs confirmScene() or requestRefund()
  'completed',           -- NFT minted, funds distributed
  'failed',              -- Generation failed
  'lock_expired'         -- Lock expired before payment
));

-- 2. Update UNIQUE constraint for multi-movie support
-- Current: UNIQUE(parent_id, slot) - WRONG (conflicts across movies)
-- New: UNIQUE(movie_id, parent_id, slot) - CORRECT
ALTER TABLE scenes DROP CONSTRAINT IF EXISTS unique_parent_slot;
ALTER TABLE scenes ADD CONSTRAINT unique_movie_parent_slot
  UNIQUE (movie_id, parent_id, slot);

-- 3. Add metadata_uri column for IPFS metadata
-- Stores ipfs://Qm... URI from Pinata after video generation
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS metadata_uri TEXT;

COMMIT;
