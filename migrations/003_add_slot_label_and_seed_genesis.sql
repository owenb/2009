-- Migration: 003_add_slot_label_and_seed_genesis
-- Description: Add slot_label column and seed genesis scene with initial slots

-- ============================================================================
-- STEP 1: Add slot_label column to scenes table
-- ============================================================================

ALTER TABLE scenes ADD COLUMN slot_label TEXT;

-- ============================================================================
-- STEP 2: Ensure genesis scene exists (intro video)
-- ============================================================================

-- Update genesis scene if it exists, or create it if it doesn't
-- The genesis scene is the intro video at /public/intro/intro.mp4
INSERT INTO scenes (
  id,
  parent_id,
  slot,
  slot_label,
  status,
  creator_address,
  creator_fid,
  created_at,
  updated_at
) VALUES (
  1,                          -- id: 1 (genesis)
  NULL,                       -- parent_id: NULL (no parent, it's the root)
  NULL,                       -- slot: NULL (not a choice, it's the root)
  NULL,                       -- slot_label: NULL (root has no label)
  'completed',                -- status: completed (video exists)
  'system',                   -- creator_address: system-generated
  NULL,                       -- creator_fid: NULL
  NOW(),                      -- created_at
  NOW()                       -- updated_at
) ON CONFLICT (id) DO UPDATE SET
  slot_label = EXCLUDED.slot_label,
  status = EXCLUDED.status,
  creator_address = COALESCE(scenes.creator_address, EXCLUDED.creator_address),
  updated_at = NOW();

-- ============================================================================
-- STEP 3: Seed first two slots extending from genesis
-- ============================================================================

-- Insert Slot A - "walk to the bedroom"
INSERT INTO scenes (
  parent_id,
  slot,
  slot_label,
  status,
  creator_address,
  creator_fid,
  created_at,
  updated_at
) VALUES (
  1,                          -- parent_id: 1 (genesis scene)
  'A',                        -- slot: A
  'walk to the bedroom',      -- slot_label: preview text for this scene
  'completed',                -- status: completed (scene exists)
  'system',                   -- creator_address: system-generated seed data
  NULL,                       -- creator_fid: NULL
  NOW(),                      -- created_at
  NOW()                       -- updated_at
) ON CONFLICT (parent_id, slot) DO NOTHING;

-- Insert Slot B - "make cup of tea"
INSERT INTO scenes (
  parent_id,
  slot,
  slot_label,
  status,
  creator_address,
  creator_fid,
  created_at,
  updated_at
) VALUES (
  1,                          -- parent_id: 1 (genesis scene)
  'B',                        -- slot: B
  'make cup of tea',          -- slot_label: preview text for this scene
  'completed',                -- status: completed (scene exists)
  'system',                   -- creator_address: system-generated seed data
  NULL,                       -- creator_fid: NULL
  NOW(),                      -- created_at
  NOW()                       -- updated_at
) ON CONFLICT (parent_id, slot) DO NOTHING;

-- Note: Slot C is intentionally NOT created
-- It remains available for the first user to claim

-- ============================================================================
-- NOTES
-- ============================================================================

-- After this migration:
-- 1. Genesis scene (id=1) exists as the root of the tree
-- 2. Slots A and B extend from genesis and are completed (filled)
-- 3. Slot C does not exist in the DB yet (available for claiming)
-- 4. slot_label stores the preview text shown to users for completed scenes
-- 5. When a user claims slot C, it will be inserted with parent_id=1, slot='C'
