# Game Design Document

**STATUS:** Active development - everything is in flux and subject to change as we figure things out in realtime.

---

## Core Concept

A "create your own adventure" game set in 2009 where users travel back to the moment Bitcoin was launched to generate new timelines. The game is framed around the idea that Bitcoin didn't turn out as we hoped—instead of replacing fiat currency, it got co-opted by the very banks we hoped it would replace. Now players can collaboratively build an infinite branching narrative by purchasing slots to generate new 8-second video scenes, creating alternate possibilities from this pivotal moment.

---

## Scene Mechanics

### Every Scene Has Three Slots
- Each 8-second video scene offers exactly **3 extension slots** (A, B, C)
- Slots can be:
  - **Empty** - Available for purchase and generation
  - **Filled** - Already generated, clickable to play

### Slot States

**Empty Slots:**
- Displayed with no text (like slot C in the intro)
- Available for any user to purchase
- Once purchased, locked for that user

**Filled Slots:**
- Display preview text (e.g., "walk to the bedroom", "make cup of tea")
- Created by previous users
- **Immediately clickable** to watch that scene
- Pre-generated and ready to play

---

## Purchase Flow

### 1. Slot Selection & Info Modal
User clicks on an empty slot → "Extend the Story" modal appears

**Modal Content:**
- **Title**: "Extend the Story"
- **Explanation**: Fun, exciting copy explaining how it works:
  - You're about to create the next scene in this story
  - Your 8-second video will live in the game world
  - Other players will discover and explore your creation
  - You'll have 1 hour to generate your scene (with AI help)
  - If generation fails, you get a 50% refund
- **Revenue Sharing Model**:
  - Each scene costs **0.007 ETH** to generate
  - Earn as others build on your branch:
    - **20%** back from each direct child scene (0.0014 ETH each)
    - **10%** back from each grandchild scene (0.0007 ETH each)
    - **5%** back from each great-grandchild scene (0.00035 ETH each)
  - Break even after ~7 follow-on scenes as your timeline evolves
  - Fully active branch can generate ongoing revenue as the adventure expands
- **Price Display**: Prominent "Extend now for 0.007 ETH" button
- **Design**: Glassmorphism, mobile-friendly, same aesthetic as rest of app

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

**Prompt Flow:**
1. User types their creative prompt for the 8-second scene
2. **GPT-4o-mini** provides tuning suggestions:
   - Analyzes prompt for clarity, creativity, technical feasibility
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
3. Trigger **50% refund** to user's wallet
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

## Navigation & Exploration

### No Tree Map
- Users **cannot see** a global map/tree of all scenes
- Must **actually explore** by watching scenes and making choices
- Creates sense of discovery and mystery

### Scene Playback
- Video plays full 8 seconds
- Holds on **last frame** when complete
- Modal appears: "What happens next?"
- Shows three slots with current state

### Going Back
- Users **can go back** to parent scenes
- Can explore different branches
- Not locked into one path
- Encourages exploration of multiple storylines

### Scene Attribution
- At bottom of each scene, display:
  - **Creator**: ENS name of user who generated it
  - **Timestamp**: When scene was created
  - **Clickable**: Tap to see the prompt they used

---

## Technical Architecture

### Single Source of Truth
- **Smart contract** is the ultimate authority
- Database is secondary (for UX and caching)
- All purchases verified on-chain

### Video Storage
- **Cloudflare R2** (S3-compatible)
- Credentials in `.env.local`
- Publicly accessible URLs for playback

### Database
- **PostgreSQL** (via Neon)
- See `schema.md` for full structure
- `scenes` table tracks all video nodes

### Video Generation
- **API**: OpenAI Sora 2 (or similar)
- **Duration**: 8 seconds per clip
- **Moderation**: API enforces content policy
- **Format**: Vertical video for mobile

---

## Special Considerations

### Genesis Block (Intro Scene)
- First scene in database (ID 1)
- `/public/intro/intro.mp4`
- Has `parent_id = NULL`
- Treated with same mechanics as other scenes
- Principle: "Least special as possible"

### Race Conditions
- Database transactions prevent double-booking
- Smart contract is final arbiter
- If conflict: blockchain wins

### Lock Edge Cases
- User closes app → lock expires after 1 minute
- Blockchain transaction pending when timer expires → likely extend lock (TBD)
- Multiple retries → tracked in `generation_attempts` field

---

## Future Considerations (TBD)

- More sophisticated loading experience
- Social features (sharing, favorites)
- Scene statistics (views, popularity)
- Creator profiles
- Economic incentives for popular branches
- Mobile-specific UX optimizations
- Notification system for generation completion

---

**Last Updated:** 2025-10-18
