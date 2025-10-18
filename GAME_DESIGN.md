# Game Design Document

**STATUS:** Active development - everything is in flux and subject to change as we figure things out in realtime.

---

## Core Concept

A "create your own adventure" game set in 2009 where users collaboratively build an infinite branching narrative by purchasing slots to generate new 8-second video scenes.

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

### 1. Slot Selection
User clicks on an empty slot (if available)

### 2. Lock & Reserve (1 Minute)
- Slot is **locked in the database** for 1 minute
- Timer starts countdown
- Other users see slot as "reserved" (cannot click)
- If user abandons: lock expires, slot becomes available again

### 3. Smart Contract Purchase
- User completes purchase transaction on **Base blockchain**
- Smart contract is the **single source of truth**
- Database transaction prevents race conditions
- **Impossible for two users to buy the same slot** (contract enforcement)

### 4. Payment Confirmation
- We verify transaction hash on-chain
- If payment succeeds → proceed to generation
- If payment fails → release lock

### 5. Prompt Submission
- New screen appears: "What happens next?"
- User types their creative prompt for the next 8-second scene
- Prompt is submitted to our backend

### 6. Video Generation
- Prompt sent to **video API** (likely OpenAI Sora 2)
- Generation status tracked in database

#### Generation Outcomes:

**Success:**
- Video generated successfully
- Downloaded and saved to **R2 bucket** (S3-compatible)
- Database updated with video URL
- Scene marked as `completed`
- Slot now filled for all users

**Moderation Rejected:**
- API rejects prompt due to content policy
- User sees error message
- User can **retry with different prompt**

**API Failure:**
- Technical error from video API
- User can **retry with same or different prompt**

### 7. Retry Window (Up to 1 Hour)
- After payment, user has **1 hour** to successfully generate video
- Can retry multiple times with different prompts
- If still failing after 1 hour:
  - User receives **50% refund**
  - Slot **reopens** as empty for others
  - Failed attempt archived

### 8. Loading Experience
- User waits on **loading screen** during generation
- **Ads displayed** during wait time
- Future: May add more interactive elements

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
