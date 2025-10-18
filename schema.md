# Database Schema

**NOTE:** This schema is in active development and subject to change as we iterate on the design.

## Three-Tier Architecture

The schema uses a three-tier hierarchy to separate slot ownership from generation attempts:

```
scenes (the slot itself - one row per parent/slot combination)
  └── scene_generation_attempts (each paid user session)
       └── prompts (each prompt submission within a session)
```

This allows multiple users to attempt the same slot if previous attempts expire/fail, while maintaining a complete audit trail.

## Tables

### scenes

The definitive tree structure of completed and in-progress scenes. Each row represents a unique slot (parent + slot letter combination). The UNIQUE constraint on (parent_id, slot) provides the atomic lock mechanism.

```sql
CREATE TABLE scenes (
  id SERIAL PRIMARY KEY,

  -- Tree structure (UNIQUE constraint is the lock mechanism)
  parent_id INTEGER REFERENCES scenes(id),
  slot CHAR(1) CHECK (slot IN ('A', 'B', 'C')),
  CONSTRAINT unique_parent_slot UNIQUE (parent_id, slot),

  -- Current lock holder
  locked_until TIMESTAMP,
  locked_by_address TEXT,
  locked_by_fid INTEGER,

  -- Final creator (whoever successfully generated the scene)
  creator_address TEXT,
  creator_fid INTEGER,

  -- Status tracking
  status VARCHAR(50) CHECK (status IN (
    'locked',              -- Reserved, awaiting payment
    'verifying_payment',   -- Payment tx received, verifying on-chain
    'awaiting_prompt',     -- Payment confirmed, waiting for prompt
    'generating',          -- Video generation in progress
    'completed',           -- Video successfully generated
    'failed',              -- Generation failed after retry window
    'lock_expired'         -- Lock expired without payment
  )),

  -- Link to successful generation attempt
  current_attempt_id INTEGER, -- FK to scene_generation_attempts(id)

  -- Video data (URL derived from scene ID: [id].mp4)
  video_job_id TEXT,
  error_message TEXT,
  last_polled_at TIMESTAMP,

  -- Retry tracking
  generation_attempts INTEGER DEFAULT 0,
  first_attempt_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_scenes_parent_id ON scenes(parent_id);
CREATE INDEX idx_scenes_slot ON scenes(slot);
CREATE INDEX idx_scenes_status ON scenes(status);
CREATE INDEX idx_scenes_locked_until ON scenes(locked_until);
CREATE INDEX idx_scenes_current_attempt_id ON scenes(current_attempt_id);
CREATE INDEX idx_scenes_video_job_id ON scenes(video_job_id);
```

### scene_generation_attempts

Tracks each paid attempt to generate a scene. Multiple attempts can exist for the same scene_id if users fail and slots reopen. Each attempt represents a user who successfully paid and has a 1-hour window to generate.

```sql
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

-- Indexes for performance
CREATE INDEX idx_scene_attempts_scene_id ON scene_generation_attempts(scene_id);
CREATE INDEX idx_scene_attempts_creator_address ON scene_generation_attempts(creator_address);
CREATE INDEX idx_scene_attempts_transaction_hash ON scene_generation_attempts(transaction_hash);
CREATE INDEX idx_scene_attempts_outcome ON scene_generation_attempts(outcome);
```

### prompts

Tracks all individual prompt submissions within a generation attempt. A single attempt can have multiple prompts if moderation rejects or API fails. This provides complete audit trail of what users tried.

```sql
CREATE TABLE prompts (
  id SERIAL PRIMARY KEY,

  -- Link to generation attempt
  attempt_id INTEGER NOT NULL REFERENCES scene_generation_attempts(id),

  -- Prompt content
  prompt_text TEXT NOT NULL,
  refined_prompt_text TEXT, -- After GPT-4o-mini tuning suggestions

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
  last_polled_at TIMESTAMP,

  -- Timestamps
  submitted_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_prompts_attempt_id ON prompts(attempt_id);
CREATE INDEX idx_prompts_video_job_id ON prompts(video_job_id);
CREATE INDEX idx_prompts_outcome ON prompts(outcome);
```

-- Foreign key constraint (added after scene_generation_attempts exists)
ALTER TABLE scenes
  ADD CONSTRAINT fk_scenes_current_attempt_id
  FOREIGN KEY (current_attempt_id) REFERENCES scene_generation_attempts(id);

## Special Cases

### Genesis Block (Intro Scene)
- The intro video (/public/intro/intro.mp4) is treated as Scene ID 1
- Has `parent_id = NULL` (no parent)
- Has `slot = NULL` (not a choice, it's the root)
- All users start here
- Principle: Treat it as "least special as possible" - same mechanics apply

## Notes

### Payment & Ownership
- **Smart contract is the single source of truth** for ownership/payment
- **R2 (S3-compatible) storage** for all video files (videos stored as `[scene_id].mp4`)
- **Lock duration**: 1 minute for initial slot reservation (before payment)
- **Retry window**: 1 hour after payment confirmation to successfully generate video
- **Refund policy**: 50% refund after 1 hour of failed attempts, slot reopens for others
- **Race conditions**: `UNIQUE(parent_id, slot)` constraint prevents double-booking atomically

### Lock Acquisition Flow
1. User clicks empty slot → Try INSERT or UPDATE if locked_until expired
2. If successful: slot status='locked', locked_until=NOW()+1min, locked_by_address/fid set
3. If lock expires without payment: status='lock_expired', slot can be taken over
4. Lock expiration handled lazily on next acquisition attempt (no background job)

### Generation Attempt Lifecycle
1. **Lock acquired**: `scenes` row created/updated with status='locked'
2. **Payment initiated**: User sees Base payment modal
3. **Payment received**: Backend gets tx hash, status='verifying_payment'
4. **Payment verified**: On-chain verification succeeds, `scene_generation_attempts` row created
5. **Awaiting prompt**: status='awaiting_prompt', user has 1 hour window
6. **Prompt submitted**: `prompts` row created, GPT-4o-mini refines prompt
7. **Video generation**: API called, status='generating', job polled via `prompts.video_job_id`
8. **Success**: Video uploaded to R2, `scenes.status='completed'`, `current_attempt_id` set
9. **Failure**: Moderation/API error → user retries new prompt (same attempt)
10. **Window expires**: After 1 hour → 50% refund, attempt outcome='failed', slot reopens

### Video Generation Tracking
- **Current job**: `prompts.video_job_id` tracks active generation (linked via `scenes.current_attempt_id`)
- **Job polling**: `prompts.last_polled_at` records when we last checked job status
- **Prompt history**: All prompts stored with refined versions (GPT-4o-mini suggestions)
- **Successful attempt**: `scenes.current_attempt_id` links to winning generation attempt

### Error Handling
- **Scene status**: 7 states tracking slot lifecycle (locked → verifying → awaiting → generating → completed/failed/lock_expired)
- **Attempt outcome**: 4 states (in_progress, succeeded, failed, abandoned)
- **Prompt outcome**: 7 states (pending, generating, success, moderation_rejected, rate_limited, api_error, timeout, abandoned)
- **Error messages**: Stored in both `scenes.error_message` (current) and `prompts.error_message` (per-prompt)
- **Retry logic**: Multiple prompts per attempt, multiple attempts per scene (if reopened)

### Prompt Refinement
- **GPT-4o-mini integration**: User's raw prompt → AI suggestions → refined_prompt_text
- **Original preserved**: Both `prompt_text` (user input) and `refined_prompt_text` stored
- **User approval**: User must accept refined version before submission
