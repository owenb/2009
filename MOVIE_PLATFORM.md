# Movie Platform Design Document

**STATUS:** Active development - everything is in flux and subject to change as we figure things out in realtime.

---

## Core Concept

An interactive movie platform where creators can launch branching narrative universes that users extend through AI-generated video scenes. Think of it as Hollywood meets collaborative storytelling meets blockchain.

**Movie creators** are like Hollywood producers - they take financial risk upfront by depositing 1-2 ETH and working with our team to create the first 4 videos (genesis + 3 extension scenes). If their movie concept resonates, they earn revenue from every scene users generate in their universe. If it flops, they absorb the loss.

**Scene creators** are like moviegoers who become co-writers - they purchase slots to extend the narrative with their ideas, earning revenue when others build on their branches.

The inaugural movie is **"2009"** - a time-travel narrative set at Bitcoin's genesis block, exploring alternate timelines where cryptocurrency could have evolved differently.

---

## Movie Creation Process

### Application & Curation

**We are highly selective.** The goal is 10-100 exceptional movies, not thousands of mediocre ones.

**Application Requirements:**
- **Story concept**: Title, description, narrative premise, genre
- **Themes & constraints**: Tone, content guidelines (e.g., "no violence"), target audience
- **Art style**: Visual aesthetic, cinematography preferences, mood boards
- **Hero's journey**: Story arc outline, key narrative beats, thematic goals
- **Creator credentials**: Bio, previous work, why this story matters
- **Marketing angle**: Target audience, distribution plan, community building strategy

**Deposit:**
- **1-2 ETH upfront** (exact amount TBD per movie complexity)
- Held in escrow contract during review
- **If approved**: Deposit retained by platform as onboarding fee
- **If rejected**: Full refund

**Review Process:**
- Platform team evaluates creative vision, commercial viability, brand fit
- May request revisions or additional materials
- Decision within 7-14 days

### Genesis Video Creation

Once approved, platform works white-glove with creator to produce first 4 videos:

**Genesis Scene (Scene 0):**
- 8-second intro video establishing the world
- Sets tone, introduces premise
- Platform generates via AI based on creator's prompt + guidance

**First Extension Scenes (Scenes A, B, C):**
- 3 pre-generated videos extending from genesis
- Demonstrates narrative possibilities to users
- Shows art style consistency
- Platform generates all 3 in consultation with creator

**Approval Cycle:**
- Creator reviews and approves each video
- Can request regeneration if needed (limited revisions)
- Once all 4 approved → movie goes live

### Movie Metadata

Each movie has rich metadata visible to users:

- **Title** (e.g., "2009")
- **Creator name** (ENS or display name)
- **Description** (1-2 paragraphs explaining premise)
- **Genre** (sci-fi, thriller, romance, horror, etc.)
- **Themes** (e.g., "decentralization, alternate history, time travel")
- **Content guidelines** (e.g., "PG-13, no graphic violence, philosophical tone")
- **Cover image** (hero shot for movie browser)
- **Created date**
- **Stats**: Total scenes, total views, active contributors

---

## Scene Mechanics

### Every Scene Has Three Slots

- Each 8-second video scene offers exactly **3 extension slots** (A, B, C)
- Slots can be:
  - **Empty** - Available for purchase and generation
  - **Filled** - Already generated, clickable to play

### Slot States

**Empty Slots:**
- Displayed with no text
- Available for any user to purchase
- Once purchased, locked for that user

**Filled Slots:**
- Display preview text (e.g., "walk to the bedroom", "make cup of tea")
- Created by previous users
- **Immediately clickable** to watch that scene
- Pre-generated and ready to play

---

## Purchase & Generation Flow

### 1. Slot Selection & Info Modal

User clicks on an empty slot → "Extend the Story" modal appears

**Modal Content:**
- **Movie context**: Shows movie title, themes, content guidelines
- **Explanation**:
  - You're about to create the next scene in this movie
  - Your 8-second video will live in the movie world
  - Other viewers will discover and explore your creation
  - You'll have 1 hour to generate your scene (with AI help)
  - If generation fails, apply for 50% refund
- **Revenue Sharing Model** (for scene creators):
  - Each scene costs **0.007 ETH** to generate
  - Earn as others build on your branch:
    - **20%** back from each direct child scene (0.0014 ETH each)
    - **10%** back from each grandchild scene (0.0007 ETH each)
    - **5%** back from each great-grandchild scene (0.00035 ETH each)
  - Break even after ~7 follow-on scenes as your branch evolves
  - Fully active branch can generate ongoing revenue
- **Price Display**: "Extend now for 0.007 ETH" button

### 2. Lock Acquisition (1 Minute)

**FIRST THING** when user clicks "Extend now" button:
- Backend attempts to lock the slot in database (INSERT or UPDATE if expired)
- `UNIQUE(parent_id, slot)` constraint ensures atomic lock
- If successful:
  - Scene row created/updated with `status='locked'`
  - `locked_until = NOW() + 1 minute`
  - `locked_by_address` and `locked_by_fid` recorded
- Other users now see: **"Selected by [user]"** with countdown timer
- Slot is **unclickable** for others until lock expires

### 3. Base Payment Modal

If lock successful → Base blockchain payment modal appears
- User completes transaction on **Base blockchain**
- 1-minute countdown visible
- User can cancel (lock will expire and release)

### 4. Lock Expiration Handling

If user abandons payment or doesn't complete within 1 minute:
- `locked_until` passes
- Scene `status` can be updated to `'lock_expired'` (lazily)
- Next user can take over the slot
- No database cleanup needed (row reused)

### 5. Payment Submission & Verification

User completes transaction → frontend sends `tx_hash` to backend

**Backend Flow:**
1. Receives transaction hash
2. Updates scene: `status='verifying_payment'`
3. **Independently verifies transaction on-chain**:
   - Checks transaction exists
   - Confirms correct amount sent
   - Validates sent to correct contract/address
   - Ensures transaction succeeded
4. If verification **fails**:
   - Release lock (`status='lock_expired'`)
   - Show error: "There was a problem with your payment"
   - Slot becomes available again
5. If verification **succeeds**:
   - Create `scene_generation_attempts` row:
     - `scene_id`, `creator_address`, `creator_fid`
     - `transaction_hash` (verified)
     - `payment_confirmed_at = NOW()`
     - `retry_window_expires_at = NOW() + 1 hour`
     - `outcome = 'in_progress'`
   - Update scene: `status='awaiting_prompt'`
   - User proceeds to prompt screen

### 6. Prompt Submission & AI Refinement

New screen appears: "What happens next?"

**Context Provided:**
- Movie title and description
- Movie themes and content guidelines (so user knows constraints)
- Preview of parent scene they're extending

**Prompt Flow:**
1. User types their creative prompt for the 8-second scene
2. **GPT-4o-mini** provides tuning suggestions:
   - Analyzes prompt for clarity, creativity, technical feasibility
   - Ensures alignment with movie's themes and guidelines
   - Suggests improvements for better video generation
   - Maintains user's creative intent
3. User sees original + refined version side-by-side
4. User can accept, edit, or reject suggestions
5. Final prompt submitted to backend
6. `prompts` row created:
   - `attempt_id` (links to scene_generation_attempt)
   - `prompt_text` (original user input)
   - `refined_prompt_text` (after GPT-4o-mini)
   - `outcome = 'pending'`

### 7. Video Generation

Refined prompt sent to **video generation API** (OpenAI Sora 2)

**Generation Process:**
1. API call initiated, `video_job_id` returned
2. Update prompt: `outcome='generating'`, store `video_job_id`
3. Update scene: `status='generating'`, `video_job_id` copied from prompt
4. Poll job status via `video_job_id` at intervals
5. Update `last_polled_at` timestamp

**Generation Outcomes:**

**✓ Success:**
- Video file received from API
- Downloaded and uploaded to **R2 bucket** as `[scene_id].mp4`
- Update prompt: `outcome='success'`, `completed_at=NOW()`
- Update scene: `status='completed'`, `current_attempt_id` set, `creator_address/fid` set
- Update attempt: `outcome='succeeded'`
- Slot now filled for all users with preview text

**✗ Moderation Rejected:**
- API rejects prompt due to content policy
- Update prompt: `outcome='moderation_rejected'`, `error_message` stored
- User sees friendly error message with explanation
- User can **retry with different prompt** (creates new prompt row, same attempt)
- Retry window still active (1 hour from payment)

**✗ Rate Limited:**
- API rate limit hit
- Update prompt: `outcome='rate_limited'`
- User sees message: "High demand - please wait a moment"
- Can retry after short delay

**✗ API Error / Timeout:**
- Technical failure from video API
- Update prompt: `outcome='api_error'` or `'timeout'`
- User can **retry with same or different prompt**
- Error tracked in `error_message` field

### 8. Retry Window (1 Hour After Payment)

- User has **1 hour from `payment_confirmed_at`** to successfully generate
- Can submit unlimited different prompts (each creates new `prompts` row)
- All attempts tracked under same `scene_generation_attempts` row
- Timer displayed showing remaining time

**If window expires without success:**
1. Update attempt: `outcome='failed'`
2. Update scene: `status='failed'`
3. User can **apply for 50% refund** (manual review initially)
   - **Implementation Note:** Initially manual review for refunds, with goal to automate once fraud patterns are understood
4. Slot **reopens** as available (another user can try)
5. Failed attempt remains in database (audit trail)

### 9. Loading Experience

During video generation:
- User waits on **loading screen**
- Progress indicator with status updates
- **Ads displayed** during wait time (monetization)
- Estimated time remaining shown
- Can't navigate away (or warned if attempting to)
- Future: Mini-games, social features during wait

---

## Revenue Model

### Scene Pricing (Fixed)

All scenes cost **0.007 ETH** regardless of movie.

### Revenue Distribution

When a user purchases a scene for 0.007 ETH:

**Scene Creator Revenue (35% total):**
- **Parent scene creator**: 20% (0.0014 ETH)
- **Grandparent scene creator**: 10% (0.0007 ETH)
- **Great-grandparent scene creator**: 5% (0.00035 ETH)

**Movie Creator Revenue (TBD%):**
- Receives bulk of remaining 65%
- Exact split TBD (likely 50-60% to movie creator, 5-15% to platform)
- Movie creator earns from **every scene in their universe**
- This is how they recoup their 1-2 ETH deposit + profit

**Platform Revenue (TBD%):**
- Small commission per scene (likely 5-15%)
- Plus the upfront 1-2 ETH deposit from approved movie creators

**Example (assuming 55/10 split of remaining 65%):**
- Scene creator revenue: 35% → 0.00245 ETH
- Movie creator revenue: 55% → 0.00385 ETH
- Platform revenue: 10% → 0.0007 ETH

---

## Movie Structure & Lifecycle

### Launch State

Every movie launches with:
- **Genesis scene** (Scene 0): 8-second intro, `parent_id = NULL`
- **3 pre-generated scenes** extending from genesis (Slots A, B, C filled)

Users immediately have 9 slots to extend (3 from each of the 3 pre-generated scenes).

### Growth

- Infinitely branching tree structure
- Each new scene adds 3 more extension opportunities
- No limit on depth or breadth

### Movie Status States

- **draft** - Being set up (not visible to users)
- **active** - Live and accepting scene contributions
- **paused** - Temporarily disabled by creator or platform
- **archived** - No longer accepting new scenes (viewable only)

### Movie Creator Controls

Can perform these actions via platform dashboard:
- **Pause movie** temporarily (slots become unclickable)
- **Resume movie** (slots active again)
- **Update description** and metadata (not title or themes)
- **View analytics**: scenes created, revenue earned, popular branches
- **Cannot**: Change pricing, delete scenes, refund users

---

## Navigation & Exploration

### Movie Browser (Home Screen)

**Featured Section:**
- Platform-curated highlighted movies
- Large cover images with trailers/previews

**Browse All Movies:**
- Grid layout with cover images
- Sortable by:
  - **Newest** (recently launched)
  - **Most popular** (total scenes)
  - **Most viewed** (aggregate views)
  - **Genre** (filter dropdown)

**Search:**
- Search by title, creator, themes, genre
- Autocomplete suggestions

### Within a Movie

**No Tree Map:**
- Users **cannot see** a global map/tree of all scenes
- Must **actually explore** by watching scenes and making choices
- Creates sense of discovery and mystery

**Scene Playback:**
- Video plays full 8 seconds
- Holds on **last frame** when complete
- Modal appears: "What happens next?"
- Shows three slots with current state

**Going Back:**
- Users **can go back** to parent scenes
- Can explore different branches
- Not locked into one path
- Breadcrumb trail shows path taken

**Scene Attribution:**
- At bottom of each scene, display:
  - **Scene creator**: ENS name of user who generated it
  - **Timestamp**: When scene was created
  - **Clickable**: Tap to see the prompt they used
- At top of screen during playback:
  - **Movie title** and creator
  - Link to movie info page

### Movie Info Page

Accessible from any scene in the movie:
- Movie title, cover image, description
- Creator name (link to creator profile)
- Themes and content guidelines
- Stats: Total scenes, total views, created date
- "Start from beginning" button

---

## Technical Architecture

### Single Source of Truth

- **Smart contract** is the ultimate authority for payments
- Database is secondary (for UX and caching)
- All purchases verified on-chain

### Database Schema Updates

**New `movies` Table:**
```sql
CREATE TABLE movies (
  id SERIAL PRIMARY KEY,

  -- URL identifier (permanent, immutable)
  slug TEXT UNIQUE NOT NULL, -- e.g., "2009", "winter"

  -- Movie metadata
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  genre TEXT,
  themes TEXT[], -- Array of theme strings
  content_guidelines TEXT, -- e.g., "PG-13, no violence"

  -- Creator (the "Hollywood producer")
  creator_address TEXT NOT NULL,
  creator_fid INTEGER,
  creator_display_name TEXT,

  -- Genesis scene (the starting point)
  genesis_scene_id INTEGER REFERENCES scenes(id),

  -- Economics
  deposit_amount_wei NUMERIC(78, 0), -- 1-2 ETH they paid
  scene_price_wei NUMERIC(78, 0) DEFAULT NULL, -- NULL = use platform default

  -- Status
  status VARCHAR(50) CHECK (status IN (
    'draft',      -- Being set up (not live)
    'active',     -- Live and accepting contributions
    'paused',     -- Temporarily disabled
    'archived'    -- No longer active
  )) DEFAULT 'draft',

  -- Stats (for discovery/ranking)
  total_scenes INTEGER DEFAULT 4, -- Starts with 4 (genesis + 3)
  total_views INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_movies_slug ON movies(slug);
CREATE INDEX idx_movies_creator_address ON movies(creator_address);
CREATE INDEX idx_movies_status ON movies(status);
CREATE INDEX idx_movies_genre ON movies(genre);
CREATE INDEX idx_movies_genesis_scene_id ON movies(genesis_scene_id);
```

**Update `scenes` Table:**
```sql
ALTER TABLE scenes ADD COLUMN movie_id INTEGER NOT NULL REFERENCES movies(id);
CREATE INDEX idx_scenes_movie_id ON scenes(movie_id);
```

**Constraint Note:**
- `UNIQUE(parent_id, slot)` still works across movies since `parent_id` is globally unique
- Scenes naturally scoped to movies via tree traversal

### Smart Contract Updates

**New Story Creation Function:**
```solidity
// Simplified version - see full implementation below
function createMovie(string memory _slug) external payable returns (uint256) {
    require(msg.value >= movieCreationFee, "Insufficient deposit");
    uint256 movieId = nextMovieId++;
    movies[movieId] = Movie({
        creator: msg.sender,
        depositAmount: msg.value,
        active: false // Requires platform approval
    });
    return movieId;
}
```

**Updated Scene Claiming:**
```solidity
function claimSlot(uint256 _movieId, uint256 _parentId, uint8 _slot) external payable {
    require(movies[_movieId].active, "Movie not active");
    // ... existing slot logic
    // Distribute to scene creators (20/10/5%) + movie creator (~55%) + treasury (~10%)
}
```

### Video Storage

- **Cloudflare R2** (S3-compatible)
- Videos stored as `[scene_id].mp4`
- Publicly accessible URLs for playback

---

## Special Considerations

### Genesis Block Pattern

Each movie's genesis scene (Scene 0):
- Has `parent_id = NULL` (no parent)
- Has `slot = NULL` (not a choice, it's the root)
- All users start here
- Pre-generated by platform with movie creator

**Design Principle:** Genesis scenes follow "least special as possible" philosophy - treated with same mechanics as other scenes to minimize special-case code.

### Race Conditions

- Database transactions prevent double-booking
- Smart contract is final arbiter
- If conflict: blockchain wins
- Lock expiration with pending blockchain transaction → may extend lock grace period (implementation TBD)

### Prompt Refinement & Alignment

- **GPT-4o-mini** enforces movie's content guidelines
- If user prompt violates movie constraints, refinement suggests alternatives
- If user insists on violating guidelines, moderation will reject
- Movie creator's themes influence prompt tuning

### Movie Isolation

- Movies are **completely separate universes**
- Scene IDs are globally unique (not per-movie)
- No cross-movie references or links
- One creator can launch multiple movies

### Failed Movies

- If movie gets few/no user-generated scenes, movie creator absorbs loss
- Platform doesn't refund deposits for unpopular movies
- This is the commercial risk model (like Hollywood flops)

---

## Future Considerations (TBD)

- **Creator profiles**: Dashboard showing all movies by one creator, total revenue
- **Movie analytics**: Heatmaps of popular branches, drop-off analysis
- **Social features**: Sharing favorite scenes, commenting, favorites
- **Scene statistics**: Views, popularity rankings
- **Economic incentives**: Bonus for creating highly-extended scenes
- **Mobile app**: Native iOS/Android (currently Base mini app)
- **Notification system**: Alert when your scene gets extended
- **Collaboration mode**: Multiple creators co-producing a movie
- **Revenue withdrawals**: How movie creators claim their earnings
- **Escrow refunds**: Automated refund if movie not approved within X days

---

**Last Updated:** 2025-10-21
