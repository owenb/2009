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

  -- Video data
  video_url TEXT NOT NULL,
  user_prompt TEXT,

  -- Creator information
  creator_fid INTEGER,

  -- Blockchain proof
  transaction_hash TEXT UNIQUE,

  -- Status tracking
  status VARCHAR(50) CHECK (status IN (
    'pending_payment',
    'generating',
    'completed',
    'failed',
    'moderation_rejected'
  )),

  -- Lock mechanism (1-minute purchase lock)
  locked_until TIMESTAMP,
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
```

## Special Cases

### Genesis Block (Intro Scene)
- The intro video (/public/intro/intro.mp4) is treated as Scene ID 1
- Has `parent_id = NULL` (no parent)
- Has `slot = NULL` (not a choice, it's the root)
- All users start here
- Principle: Treat it as "least special as possible" - same mechanics apply

## Notes

- **Smart contract is the single source of truth** for ownership/payment
- **R2 (S3-compatible) storage** for all video files
- **Lock duration**: 1 minute for initial checkout
- **Retry window**: Up to 1 hour after payment if generation fails
- **Refund policy**: 50% refund after 1 hour of failed attempts, slot reopens
- **Race conditions**: Database transactions prevent double-purchase, but smart contract is ultimate arbiter
