# Database Schema

**NOTE:** This schema is in active development and subject to change as we iterate on the design.

## Tables

### scenes

The core table that stores all video scenes in the game. Each scene represents an 8-second video clip that can branch into three possible paths (slots A, B, C).

```sql
CREATE TABLE scenes (
  id SERIAL PRIMARY KEY,

  -- Tree structure
  parent_id INTEGER REFERENCES scenes(id),
  slot CHAR(1) CHECK (slot IN ('A', 'B', 'C')),

  -- Video data (URL derived from scene ID: [id].mp4)
  prompt_id INTEGER REFERENCES prompts(id),
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

-- Indexes for performance
CREATE INDEX idx_scenes_parent_id ON scenes(parent_id);
CREATE INDEX idx_scenes_slot ON scenes(slot);
CREATE INDEX idx_scenes_status ON scenes(status);
CREATE INDEX idx_scenes_locked_until ON scenes(locked_until);
CREATE INDEX idx_scenes_transaction_hash ON scenes(transaction_hash);
CREATE INDEX idx_scenes_prompt_id ON scenes(prompt_id);
CREATE INDEX idx_scenes_video_job_id ON scenes(video_job_id);
```

### prompts

Tracks all prompt submission attempts for each scene. This provides a complete audit trail of generation attempts, including failed/rejected prompts.

```sql
CREATE TABLE prompts (
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

-- Indexes for performance
CREATE INDEX idx_prompts_scene_id ON prompts(scene_id);
CREATE INDEX idx_prompts_video_job_id ON prompts(video_job_id);
CREATE INDEX idx_prompts_outcome ON prompts(outcome);
```

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
- **Lock duration**: 1 minute for initial checkout
- **Retry window**: Up to 1 hour after payment if generation fails
- **Refund policy**: 50% refund after 1 hour of failed attempts, slot reopens
- **Race conditions**: Database transactions prevent double-purchase, but smart contract is ultimate arbiter

### Video Generation Tracking
- **Current job**: `scenes.video_job_id` tracks the active generation job
- **Job polling**: `scenes.last_polled_at` records when we last checked job status
- **Prompt history**: All prompt attempts stored in `prompts` table with outcomes
- **Successful prompt**: `scenes.prompt_id` links to the final accepted prompt

### Error Handling
- **Status values**: Fine-grained tracking including `rate_limited`, `api_error`, `timeout`, `moderation_rejected`
- **Error messages**: Stored in both `scenes.error_message` (current) and `prompts.error_message` (historical)
- **Prompt outcomes**: Track each attempt separately - `success`, `moderation_rejected`, `rate_limited`, `api_error`, `timeout`, `abandoned`
- **Retry logic**: Users can submit multiple prompts; each tracked independently
