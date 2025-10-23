# 2009 Architecture Documentation

**Last Updated:** 2025-10-23

This document provides a comprehensive technical overview of the 2009 create-your-own-adventure game built on Base blockchain.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Database Architecture](#database-architecture)
3. [Component Architecture](#component-architecture)
4. [Video System](#video-system)
5. [User Flows](#user-flows)
6. [Payment & Blockchain Integration](#payment--blockchain-integration)
7. [Theming System](#theming-system)
8. [API Routes](#api-routes)
9. [State Management](#state-management)
10. [Performance Optimizations](#performance-optimizations)
11. [Analytics & Tracking](#analytics--tracking)
12. [Navigation & Routing](#navigation--routing)
13. [Error Handling](#error-handling)
14. [Development Environment](#development-environment)

---

## System Overview

### Concept

2009 is a "create your own adventure" interactive experience where:
- Users watch 8-second video clips set in 2009 (Bitcoin's launch year)
- After each scene, 3 slots (A, B, C) appear for extending the narrative
- Users purchase slots to inject their ideas into the story
- AI generates new scenes based on user prompts
- Creates an infinitely branching narrative tree

### Tech Stack

```
Frontend:
- Next.js 14+ (App Router, Server Components)
- React 18 (Client Components for interactivity)
- Tailwind CSS v4 (CSS-based config)
- OnchainKit (Base mini app integration, wallet)
- wagmi + viem (Ethereum interactions)

Backend:
- Next.js API Routes
- PostgreSQL (via Neon)
- Cloudflare R2 (S3-compatible video storage)

Blockchain:
- Base (L2 Ethereum)
- Smart contract: VideoAdventure.sol (claimSlot function)

External Services:
- Video generation API (details in generation flow)
- GPT-4o-mini (prompt refinement)
```

### Directory Structure

```
2009-base-app/
├── app/
│   ├── api/                    # Next.js API routes
│   │   ├── movies/            # Movie management endpoints
│   │   ├── scenes/            # Scene operations
│   │   │   ├── tree/          # Scene tree for map
│   │   │   └── [sceneId]/     # Dynamic scene endpoints
│   │   ├── play/              # Scene playback
│   │   └── user/              # User-specific data
│   ├── components/            # React components
│   │   ├── Video.tsx          # Video player
│   │   ├── WatchMovie.tsx     # Main orchestrator
│   │   ├── SwipeableSlotChoice.tsx  # Gesture navigation
│   │   ├── MovieThemeProvider.tsx   # Theme injection
│   │   ├── Home.tsx           # Movie browser
│   │   └── ...                # Other UI components
│   ├── contexts/              # React contexts
│   ├── movie/                 # Movie routes
│   │   └── [slug]/           # /movie/2009, /movie/cyberpunk, etc.
│   ├── types/                # TypeScript types
│   ├── globals.css           # Tailwind + theme config
│   └── layout.tsx            # Root layout
├── lib/
│   ├── db/                   # Database helpers
│   │   ├── types.ts         # Shared types
│   │   ├── movies.ts        # Movie queries
│   │   ├── scenes.ts        # Scene queries
│   │   └── ...              # Other DB modules
│   ├── r2.ts                # R2 storage utilities
│   ├── analytics.ts         # View tracking
│   └── VideoAdventure.abi.json  # Smart contract ABI
├── migrations/              # Database migrations
├── schema.md               # Database schema documentation
├── CLAUDE.md               # Project instructions
└── Architecture.md         # This file
```

---

## Database Architecture

### Four-Tier Hierarchy

The database uses a four-tier structure to support multiple movies with branching narratives:

```
movies (narrative universes)
  └── scenes (slot tree nodes)
       └── scene_generation_attempts (paid user sessions)
            └── prompts (individual prompt submissions)
```

Plus a separate table for analytics:
```
scene_views (individual view events)
```

### Table: `movies`

**Purpose:** Each movie is a self-contained narrative universe (like "2009", "Cyberpunk 2077", "The Winter of 1987").

**Schema:**
```sql
CREATE TABLE movies (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,           -- URL identifier: /movie/2009
  title TEXT NOT NULL,                 -- Display name
  description TEXT,
  cover_image_url TEXT,
  genre TEXT,                          -- sci-fi, thriller, etc.
  themes TEXT[],                       -- Array: ["time travel", "bitcoin"]
  content_guidelines TEXT,             -- PG-13, philosophical, etc.
  creator_address TEXT NOT NULL,       -- Movie creator (producer)
  creator_fid INTEGER,
  creator_display_name TEXT,
  genesis_scene_id INTEGER,            -- Starting scene
  deposit_amount_wei NUMERIC(78, 0),   -- 1-2 ETH upfront
  scene_price_wei NUMERIC(78, 0),      -- NULL = platform default
  color_scheme JSONB,                  -- Per-movie theming
  status VARCHAR(50),                  -- draft, active, paused, archived
  total_scenes INTEGER DEFAULT 4,      -- Cached count
  total_views INTEGER DEFAULT 0,       -- Cached count
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Key Points:**
- `slug` is permanent and immutable (URL path)
- `genesis_scene_id` points to the starting scene (Scene 0)
- `color_scheme` enables per-movie visual theming (see Theming System)
- Each movie starts with 4 pre-generated scenes (genesis + 3 extensions)
- Movie creator earns revenue from every scene in their universe (~55%)

**Code Reference:**
- Types: `lib/db/types.ts:10-31`
- Queries: `lib/db/movies.ts`
- Usage: `app/movie/[slug]/page.tsx:17`

### Table: `scenes`

**Purpose:** The definitive tree structure. Each row represents ONE slot in the narrative tree.

**Schema:**
```sql
CREATE TABLE scenes (
  id SERIAL PRIMARY KEY,
  movie_id INTEGER NOT NULL REFERENCES movies(id),
  parent_id INTEGER REFERENCES scenes(id),
  slot CHAR(1) CHECK (slot IN ('A', 'B', 'C')),
  CONSTRAINT unique_parent_slot UNIQUE (parent_id, slot),  -- ATOMIC LOCK

  -- Lock state
  locked_until TIMESTAMP,
  locked_by_address TEXT,
  locked_by_fid INTEGER,

  -- Creator (successful generator)
  creator_address TEXT,
  creator_fid INTEGER,

  -- Status
  status VARCHAR(50) CHECK (status IN (
    'locked', 'verifying_payment', 'awaiting_prompt',
    'generating', 'completed', 'failed', 'lock_expired'
  )),

  -- Link to successful attempt
  current_attempt_id INTEGER,

  -- Display data
  slot_label TEXT,               -- "walk to the bedroom"
  view_count INTEGER DEFAULT 0,

  -- Video generation tracking
  video_job_id TEXT,
  error_message TEXT,
  last_polled_at TIMESTAMP,
  generation_attempts INTEGER DEFAULT 0,
  first_attempt_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Critical Design: Atomic Lock via UNIQUE Constraint**

The `UNIQUE(parent_id, slot)` constraint provides the atomic locking mechanism:
- Only ONE row can exist for `(parent_id=5, slot='A')`
- INSERT fails if slot already claimed → prevents race conditions
- No need for distributed locks or transactions
- Database guarantees atomicity

**Status Flow:**
```
locked → verifying_payment → awaiting_prompt → generating → completed
  ↓                                                              ↓
lock_expired                                                  failed
```

**Code References:**
- Types: `lib/db/types.ts:66-97`
- Queries: `lib/db/scenes.ts`
- Lock acquisition: `app/api/scenes/[sceneId]/lock/route.ts`

### Table: `scene_generation_attempts`

**Purpose:** Tracks each paid attempt to generate a scene. Multiple attempts can exist for the same scene_id if previous attempts fail.

**Schema:**
```sql
CREATE TABLE scene_generation_attempts (
  id SERIAL PRIMARY KEY,
  scene_id INTEGER NOT NULL REFERENCES scenes(id),
  creator_address TEXT NOT NULL,
  creator_fid INTEGER,
  transaction_hash TEXT UNIQUE,
  payment_confirmed_at TIMESTAMP,
  retry_window_expires_at TIMESTAMP,  -- 1 hour from payment
  outcome VARCHAR(50) CHECK (outcome IN (
    'in_progress', 'succeeded', 'failed', 'abandoned'
  )),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Retry Window Logic:**
- Users have 1 hour from payment to successfully generate video
- Can submit unlimited prompts within window
- After 1 hour of failures: 50% refund, slot reopens
- Each prompt submission creates new row in `prompts` table

**Code References:**
- Types: `lib/db/types.ts:156-169`
- Creation: `app/api/scenes/verify-payment/route.ts`

### Table: `prompts`

**Purpose:** Audit trail of all prompt submissions within an attempt.

**Schema:**
```sql
CREATE TABLE prompts (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES scene_generation_attempts(id),
  prompt_text TEXT NOT NULL,           -- User's raw input
  refined_prompt_text TEXT,            -- After GPT-4o-mini refinement
  video_job_id TEXT,                   -- Generation API job ID
  outcome VARCHAR(50) CHECK (outcome IN (
    'pending', 'generating', 'success',
    'moderation_rejected', 'rate_limited', 'api_error',
    'timeout', 'abandoned'
  )),
  error_message TEXT,
  last_polled_at TIMESTAMP,
  submitted_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

**Refinement Flow:**
1. User submits prompt → stored in `prompt_text`
2. GPT-4o-mini suggests improvements → stored in `refined_prompt_text`
3. User accepts/modifies → final version used for generation

**Code References:**
- Types: `lib/db/types.ts:189-211`
- Creation: `app/api/prompts/route.ts` (assumed, not in read files)

### Table: `scene_views`

**Purpose:** Analytics tracking - each row = one scene view.

**Schema:**
```sql
CREATE TABLE scene_views (
  id SERIAL PRIMARY KEY,
  scene_id INTEGER NOT NULL REFERENCES scenes(id),
  viewer_address TEXT,        -- NULL if wallet not connected
  viewer_fid INTEGER,         -- NULL if Farcaster not available
  session_id UUID NOT NULL,   -- Client-generated UUID
  viewed_at TIMESTAMP DEFAULT NOW(),
  referrer_scene_id INTEGER,  -- Previous scene (path tracking)
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Session Tracking:**
- Client generates UUID on load → groups user's exploration session
- 30-minute session window (client-managed)
- Enables path analysis: "Users who watched A→B→C"

**Code References:**
- Types: `lib/db/types.ts:231-240`
- Tracking: `lib/analytics.ts` and `app/components/Video.tsx:161-172`

### Special Cases

#### Genesis Scene
- Each movie has one genesis scene (the intro)
- `parent_id = NULL`, `slot = NULL`
- Pre-generated by platform + movie creator
- All users start here

#### Video Storage
- Videos stored in R2 as `{sceneId}.mp4`
- Genesis scene: `INTRO.mp4`
- Signed URLs expire after 1 hour → auto-refresh at 55-minute mark

#### Foreign Key Constraint
```sql
ALTER TABLE scenes
  ADD CONSTRAINT fk_scenes_current_attempt_id
  FOREIGN KEY (current_attempt_id)
  REFERENCES scene_generation_attempts(id);
```
Links scene to its successful generation attempt.

---

## Component Architecture

### Component Hierarchy

```
app/layout.tsx (Root Layout)
  └── OnchainKitProvider + WagmiProvider (Wallet)
       └── MovieThemeProvider (Per-movie CSS variables)
            └── WatchMovie (Main orchestrator)
                 ├── Video (Player + attribution + share)
                 ├── <video> elements (Hidden pre-cache elements)
                 └── SwipeableSlotChoice (Gesture navigation)
                      ├── ExtendStoryModal
                      ├── AboutModal
                      └── SceneMapModal
```

### Core Components

#### `WatchMovie.tsx`

**Purpose:** Main orchestrator for movie playback experience.

**Responsibilities:**
1. Manages scene state (current, previous, history stack)
2. Controls video visibility and modal state
3. Pre-loads slot data during video playback
4. Handles scene transitions and back navigation
5. Checks for user's active generation attempts
6. Manages scene history for back button

**Key State:**
```typescript
const [showVideo, setShowVideo] = useState(true);
const [showPopup, setShowPopup] = useState(false);
const [currentScene, setCurrentScene] = useState<SceneData | null>(null);
const [parentSceneId, setParentSceneId] = useState<number | 'genesis'>(genesisSceneId);
const [previousSceneId, setPreviousSceneId] = useState<number | null>(null);
const [preloadedSlots, setPreloadedSlots] = useState<PreloadedSlotsData | null>(null);
const [activeAttempts, setActiveAttempts] = useState<ActiveAttempt[]>([]);
const [sceneHistory, setSceneHistory] = useState<SceneData[]>([]);
```

**Pre-loading Logic (app/components/WatchMovie.tsx:73-97):**
```typescript
useEffect(() => {
  if (!showVideo) {
    setPreloadedSlots(null);
    return;
  }

  // Video is playing - preload slots AND video URLs
  const preloadSlots = async () => {
    const response = await fetch(`/api/scenes/${parentSceneId}/slots`);
    const data = await response.json();
    setPreloadedSlots(data); // Includes videoUrl for completed slots
  };

  preloadSlots();
}, [showVideo, parentSceneId]);
```

**Scene Transition Flow:**
```typescript
handleSlotSelected(sceneData) {
  // 1. Hide modal
  setShowPopup(false);

  // 2. Clear preloaded data
  setPreloadedSlots(null);

  // 3. Track analytics
  setPreviousSceneId(currentScene?.sceneId ?? null);

  // 4. Add to history (for back button)
  if (currentScene) {
    setSceneHistory(prev => [...prev, currentScene]);
  }

  // 5. Set new scene
  setCurrentScene(sceneData);

  // 6. Show video
  setShowVideo(true);

  // 7. Update parent (triggers preload effect)
  setParentSceneId(sceneData.sceneId);
}
```

**Active Attempts Banner (app/components/WatchMovie.tsx:212-249):**
- Checks `/api/user/active-attempts` on wallet connect
- Shows green banner if user has in-progress generations
- "Resume" button navigates to creation or generation page
- Dismissable but re-checks on wallet change

**Code Reference:** `app/components/WatchMovie.tsx`

#### `Video.tsx`

**Purpose:** Video player with autoplay, controls, attribution, and analytics.

**Features:**
1. **Signed URL Management**
   - Fetches 1-hour signed URLs from `/api/scenes/{id}/video`
   - Auto-refreshes at 55-minute mark
   - Accepts `directUrl` prop to skip fetch (for pre-cached videos)

2. **Autoplay with Fallback**
   - Attempts autoplay when `isVisible=true`
   - Catches browser policy blocks
   - Shows "Click to Play" button if blocked
   - Smart error discrimination (ignores interruption errors)

3. **Analytics Tracking**
   - Calls `trackSceneView()` once per scene load
   - Tracks viewer address, FID, referrer scene
   - Prevents duplicate tracking with `hasTrackedView` flag

4. **Controls**
   - Mute/unmute button (top-left)
   - Share button (Farcaster cast via OnchainKit)
   - Creator attribution (bottom-left with ENS resolution)

5. **Error Handling**
   - Loading spinner during fetch
   - Retry button on error
   - Manual play button if autoplay blocked
   - Smart interruption error filtering (doesn't show errors for rapid scene changes)

**Autoplay Logic (app/components/Video.tsx:130-177):**
```typescript
useEffect(() => {
  if (!isVisible || !videoRef.current || !videoUrl) return;

  let cancelled = false;

  const attemptPlay = async () => {
    try {
      await videoRef.current!.play();
      if (!cancelled) {
        setNeedsManualPlay(false);
      }
    } catch (err: any) {
      if (cancelled) return;

      // Discriminate: only show button for REAL autoplay blocks
      const isInterruption =
        err.name === 'AbortError' ||
        err.message?.includes('interrupted') ||
        err.message?.includes('aborted');

      if (!isInterruption) {
        console.error('Video autoplay blocked by browser:', err.message);
        setNeedsManualPlay(true);
      }
    }
  };

  attemptPlay();

  // Track view (only once per scene)
  if (!hasTrackedView && sceneId !== null) {
    trackSceneView({
      sceneId,
      viewerAddress,
      viewerFid,
      referrerSceneId
    }).then((success) => {
      if (success && !cancelled) {
        setHasTrackedView(true);
      }
    });
  }

  return () => {
    cancelled = true; // Cleanup flag
  };
}, [isVisible, videoUrl, hasTrackedView, sceneId, viewerAddress, viewerFid, referrerSceneId]);
```

**Manual Play with Loading State (app/components/Video.tsx:180-202):**
```typescript
const handleManualPlay = async () => {
  if (!videoRef.current) return;

  try {
    // Ensure video is loaded before playing
    if (videoRef.current.readyState < 2) {
      await new Promise((resolve) => {
        const handleCanPlay = () => {
          videoRef.current?.removeEventListener('canplay', handleCanPlay);
          resolve(undefined);
        };
        videoRef.current?.addEventListener('canplay', handleCanPlay);
        videoRef.current?.load();
      });
    }

    await videoRef.current.play();
    setNeedsManualPlay(false);
  } catch (err) {
    console.error('Manual play failed:', err);
    // Keep button visible if it fails
  }
};
```

**Code Reference:** `app/components/Video.tsx`

#### `SwipeableSlotChoice.tsx`

**Purpose:** Gesture-based navigation for slot selection.

**Features:**
1. **Gesture Support**
   - Swipe left → Slot A
   - Swipe right → Slot B
   - Swipe down → Slot C
   - Swipe up → Go back
   - Click/tap → Desktop compatibility

2. **Swipe Thresholds (Optimized for Snappy Feel)**
   ```typescript
   const SWIPE_THRESHOLD = 60; // px - reduced for quicker response
   const VELOCITY_THRESHOLD = 0.5; // px/ms - for flick gestures
   ```

3. **Slot State Machine**
   - **Empty**: Available for purchase (highlighted in gold)
   - **Filled**: Completed scene (click to watch)
   - **Own**: User's paid attempt (resume creation/view generation)
   - **Locked**: Someone else's active attempt

4. **Payment Flow**
   - Click empty slot → ExtendStoryModal
   - User confirms → Lock acquisition (`/api/scenes/{id}/lock`)
   - Lock success → Base payment modal (wagmi)
   - Transaction confirmed → Payment verification (`/api/scenes/verify-payment`)
   - Navigate to `/movie/{slug}/create?attemptId={id}&sceneId={id}`

5. **Pre-cached Video Playback**
   - Checks `preloadedData.slots` for `videoUrl`
   - If present, passes to Video component → instant playback
   - No loading spinner for pre-cached scenes

**Slot State Determination (app/components/SwipeableSlotChoice.tsx:131-190):**
```typescript
const getSlotState = (slotInfo: SlotInfo) => {
  // Filled slot (completed)
  if (slotInfo.exists && slotInfo.status === 'completed') {
    return {
      type: 'filled' as const,
      canInteract: isConnected,
      label: slotInfo.label || 'view scene',
      action: () => handleFilledSlotClick(slotInfo.slot)
    };
  }

  // Own attempt (user paid for this)
  const isOwnAttempt = !!(
    slotInfo.attemptId &&
    slotInfo.attemptCreator &&
    address &&
    slotInfo.attemptCreator.toLowerCase() === address.toLowerCase()
  );

  if (isOwnAttempt) {
    const hasActivePrompt = slotInfo.latestPromptId &&
      (slotInfo.latestPromptOutcome === 'pending' ||
       slotInfo.latestPromptOutcome === 'generating');

    return {
      type: 'own' as const,
      canInteract: true,
      label: hasActivePrompt ? 'view generation' : 'resume your scene',
      sublabel: hasActivePrompt ? 'video generating...' : 'you paid for this',
      action: () => handleResumeSlot(...)
    };
  }

  // Locked by someone else
  if (slotInfo.attemptId || slotInfo.isLocked || ...) {
    return {
      type: 'locked' as const,
      canInteract: false,
      label: 'being created...',
      action: null
    };
  }

  // Empty/available
  return {
    type: 'empty' as const,
    canInteract: isConnected && !isPending && !isConfirming,
    label: 'extend this story',
    action: () => handleSlotClick(slotInfo.slot, slotIndex)
  };
};
```

**Gesture Handling (app/components/SwipeableSlotChoice.tsx:378-423):**
```typescript
const handleDragStart = (clientX, clientY) => {
  setIsDragging(true);
  dragStartRef.current = { x: clientX, y: clientY, time: Date.now() };
  setDragOffset({ x: 0, y: 0 });
  setSwipeDirection(null);
};

const handleDragMove = (clientX, clientY) => {
  if (!isDragging) return;

  const deltaX = clientX - dragStartRef.current.x;
  const deltaY = clientY - dragStartRef.current.y;

  setDragOffset({ x: deltaX, y: deltaY });

  // Determine dominant direction
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    setSwipeDirection(deltaX > 0 ? 'right' : 'left');
  } else {
    setSwipeDirection(deltaY > 0 ? 'down' : 'up');
  }
};

const handleDragEnd = (clientX, clientY) => {
  if (!isDragging) return;

  const deltaX = clientX - dragStartRef.current.x;
  const deltaY = clientY - dragStartRef.current.y;
  const deltaTime = Date.now() - dragStartRef.current.time;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const velocity = distance / deltaTime;

  setIsDragging(false);

  // Check thresholds
  const thresholdMet = distance > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD;

  if (thresholdMet && swipeDirection) {
    handleSwipeComplete(swipeDirection);
  } else {
    // Snap back
    setDragOffset({ x: 0, y: 0 });
    setSwipeDirection(null);
  }
};
```

**Visual Highlights for Available Slots (app/components/SwipeableSlotChoice.tsx:524-543):**
```typescript
const isAvailable = slotState.type === 'empty' && slotState.canInteract;

return (
  <div className={`
    ${isAvailable ? 'bg-black/60' : 'bg-black/40'}
    backdrop-blur-sm
  `}>
    {/* Gold highlight for available slots */}
    {isAvailable && (
      <div className="absolute inset-0 bg-[var(--movie-primary,#FFD700)] opacity-20 rounded-lg blur-sm" />
    )}

    <div className={`
      ${isAvailable ? 'text-[var(--movie-primary,#FFD700)]' : ''}
    `}>
      {indicator}{displayLabel}
    </div>
  </div>
);
```

**Code Reference:** `app/components/SwipeableSlotChoice.tsx`

#### `MovieThemeProvider.tsx`

**Purpose:** Injects per-movie color schemes as CSS variables.

**How It Works:**
1. Receives `colorScheme` prop from database (JSONB)
2. Converts to CSS variables via `colorSchemeToCSS()`
3. Injects into component tree via inline styles
4. Tailwind utilities reference these variables

**Example:**
```typescript
// Database: { primary: "#FFD700", secondary: "#FFA500", ... }

// MovieThemeProvider converts to:
const cssVars = {
  '--movie-primary': '#FFD700',
  '--movie-secondary': '#FFA500',
  '--movie-accent': '#FF6347',
  '--movie-bg': '#000000',
  '--movie-bg-overlay': 'rgba(0, 0, 0, 0.8)',
  '--movie-text': '#FFFFFF',
  '--movie-text-muted': 'rgba(255, 255, 255, 0.6)'
};

// Tailwind classes use these:
<div className="bg-movie-primary text-movie-text">
  <button className="bg-movie-accent hover:bg-movie-secondary">
```

**Height Fix (2025-10-23):**
Changed from `min-h-screen` to `h-screen` to fix video visibility bug:
```typescript
// app/components/MovieThemeProvider.tsx:37
<div className="h-screen w-full" style={cssVars}>
  {children}
</div>
```

**Code Reference:** `app/components/MovieThemeProvider.tsx`

#### `Home.tsx`

**Purpose:** Movie browser on homepage (`/`).

**Features:**
1. Fetches active movies from `/api/movies`
2. Filters by genre, search query
3. Sorts by views, scenes, date, title
4. Pagination (12 per page)
5. Click card → navigate to `/movie/{slug}`

**Code Reference:** `app/components/Home.tsx`

---

## Video System

### Storage Architecture

**Provider:** Cloudflare R2 (S3-compatible API)

**Naming Convention:**
- Genesis/intro: `INTRO.mp4`
- All other scenes: `{sceneId}.mp4`

**Bucket Structure:**
```
scenes/ (bucket)
├── INTRO.mp4           (genesis scene)
├── 1.mp4               (scene ID 1)
├── 2.mp4               (scene ID 2)
├── 3.mp4               (scene ID 3)
└── ...
```

**Configuration (`.env.local`):**
```bash
AWS_S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_S3_BUCKET_NAME=scenes
R2_PUBLIC_URL=https://scenes.your-domain.com  # Optional
```

### Signed URL System

**Why Signed URLs?**
- Security: Videos not publicly accessible
- Expiration: URLs expire after 1 hour
- Cost control: Prevents hotlinking
- Flexibility: Can revoke access by changing keys

**Generation (lib/r2.ts:45-78):**
```typescript
export async function getSignedVideoUrl(
  sceneId: number | null,
  expiresIn: number = 3600 // 1 hour
): Promise<string> {
  const key = sceneId === null ? 'INTRO.mp4' : `${sceneId}.mp4`;

  const client = getR2Client();

  const command = new GetObjectCommand({
    Bucket: AWS_S3_BUCKET_NAME,
    Key: key,
  });

  // Generate signed URL
  const signedUrl = await getSignedUrl(client, command, { expiresIn });

  return signedUrl;
}
```

**Auto-Refresh Logic (app/components/Video.tsx:104-120):**
```typescript
useEffect(() => {
  if (!expiresAt) return;

  const now = Date.now();
  const expiryTime = expiresAt.getTime();
  const refreshTime = expiryTime - 5 * 60 * 1000; // 5 min before expiry
  const timeUntilRefresh = refreshTime - now;

  if (timeUntilRefresh > 0) {
    const timer = setTimeout(() => {
      fetchVideoUrl(); // Re-fetch new signed URL
    }, timeUntilRefresh);

    return () => clearTimeout(timer);
  }
}, [expiresAt]);
```

**API Endpoint:**
```
GET /api/scenes/{sceneId}/video
→ Returns: { url: "https://...", expiresAt: "2025-10-23T15:00:00Z" }
```

### Pre-Caching System

**Goal:** Instant playback when navigating between scenes.

**Three-Stage Pipeline:**

#### Stage 1: Slot Data Preloading (During Video Playback)

**When:** Video starts playing
**What:** Fetch slot metadata + video URLs for next scenes
**Where:** `app/components/WatchMovie.tsx:73-97`

```typescript
useEffect(() => {
  if (!showVideo) {
    setPreloadedSlots(null);
    return;
  }

  // Video is playing - preload next slots
  const preloadSlots = async () => {
    const response = await fetch(`/api/scenes/${parentSceneId}/slots`);
    const data = await response.json();
    setPreloadedSlots(data); // Includes videoUrl for completed slots
  };

  preloadSlots();
}, [showVideo, parentSceneId]);
```

**API Response:**
```json
{
  "parentId": 5,
  "slots": [
    {
      "slot": "A",
      "exists": true,
      "sceneId": 6,
      "label": "walk to the bedroom",
      "status": "completed",
      "videoUrl": "https://r2.../6.mp4?X-Amz-Signature=..."  // ← 1-hour signed URL
    },
    { "slot": "B", "exists": false, ... },
    { "slot": "C", "exists": true, "sceneId": 8, "videoUrl": "...", ... }
  ]
}
```

**Code:** `app/api/scenes/[sceneId]/slots/route.ts:28-38`

#### Stage 2: Browser Video Pre-Caching (Hidden Video Elements)

**When:** Slot data loaded
**What:** Create hidden `<video>` elements with `preload="auto"`
**Why:** Browser automatically downloads and caches video files
**Where:** `app/components/WatchMovie.tsx:266-281`

```typescript
{showVideo && preloadedSlots?.slots && preloadedSlots.slots.map((slot) => {
  // Only pre-cache completed slots with video URLs
  if (slot.videoUrl && slot.status === 'completed') {
    return (
      <video
        key={`precache-${parentSceneId}-${slot.slot}`}
        src={slot.videoUrl}
        preload="auto"       // ← Tells browser to download
        muted
        playsInline
        className="absolute opacity-0 pointer-events-none w-px h-px -z-10"
      />
    );
  }
  return null;
})}
```

**Browser Behavior:**
- `preload="auto"` → browser starts downloading immediately
- Video goes into browser's HTTP cache
- Subsequent requests for same URL → instant (cache hit)

#### Stage 3: Instant Playback (Cache Utilization)

**When:** User selects a slot
**What:** Check if video URL exists in preloaded data
**Result:** Instant playback (no loading spinner)
**Where:** `app/components/SwipeableSlotChoice.tsx:193-236`

```typescript
const handleFilledSlotClick = async (slot: 'A' | 'B' | 'C') => {
  if (!isConnected || !address) {
    alert("Please connect your wallet to continue watching!");
    return;
  }

  try {
    const cachedSlot = slots.find(s => s.slot === slot);
    const hasCachedVideo = !!cachedSlot?.videoUrl;

    // Only show loading if NOT cached
    if (!hasCachedVideo) {
      setLoadingSlot(slot);
    }

    const response = await fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentSceneId, slot }),
    });

    const sceneData = await response.json();

    // Use cached URL if available
    if (hasCachedVideo && cachedSlot) {
      sceneData.videoUrl = cachedSlot.videoUrl;
    }

    if (onSlotSelected) {
      onSlotSelected(sceneData); // → Video.tsx receives directUrl prop
    }
  } catch (err) {
    console.error('Error loading scene:', err);
    alert('Failed to load scene. Please try again.');
    setLoadingSlot(null);
  }
};
```

**Performance Impact:**
```
Without pre-caching:
User clicks slot → API request (200ms) → Video URL fetch (500ms) → Video download (2s) → Play
Total: ~2.7 seconds

With pre-caching:
User clicks slot → API request (200ms) → Play (video already downloaded)
Total: ~0.2 seconds (13x faster!)
```

### Upload Flow

**When:** Scene generation completes

**Process:**
1. Video API returns video URL
2. Backend downloads video
3. Uploads to R2 as `{sceneId}.mp4`
4. Updates scene status to `completed`

**Code (lib/r2.ts:137-161):**
```typescript
export async function uploadVideoFromUrl(
  sceneId: number,
  videoUrl: string,
  authHeader?: string
): Promise<string> {
  console.log(`Downloading video from: ${videoUrl}`);

  // Download video
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const response = await fetch(videoUrl, { headers });

  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const videoBlob = await response.blob();
  console.log(`Downloaded video: ${videoBlob.size} bytes`);

  // Upload to R2
  return await uploadVideoToR2(sceneId, videoBlob);
}
```

---

## User Flows

### Flow 1: First-Time Visitor

```
1. User visits / (homepage)
   ├─ Home.tsx renders movie list
   ├─ Fetches from /api/movies?status=active
   └─ Shows cover images, titles, stats

2. User clicks movie card
   └─ Navigates to /movie/{slug} (e.g., /movie/2009)

3. MoviePage (Server Component)
   ├─ Fetches movie from database
   ├─ Wraps in MovieThemeProvider (color scheme)
   └─ Renders WatchMovie component

4. WatchMovie initializes
   ├─ Sets parentSceneId = genesisSceneId
   ├─ setShowVideo(true) → Video component appears
   └─ Video.tsx fetches genesis video URL

5. Genesis video plays
   ├─ Video.tsx calls trackSceneView() (analytics)
   ├─ WatchMovie preloads next slots during playback
   └─ Hidden <video> elements start downloading next scenes

6. Video ends → onVideoEnd()
   └─ setShowPopup(true) → SwipeableSlotChoice appears

7. User sees 3 slots (A, B, C)
   ├─ Swipe left/right/down or tap
   └─ Each slot shows status (empty, filled, locked)

8a. If slot is FILLED (someone already created it):
   ├─ User swipes/taps
   ├─ handleFilledSlotClick()
   ├─ Checks for cached videoUrl
   ├─ Calls /api/play
   └─ Instant playback (cache hit!)

8b. If slot is EMPTY (available):
   ├─ User swipes/taps
   ├─ ExtendStoryModal appears ("Extend the Story")
   ├─ User clicks "Extend now"
   └─ Proceeds to Flow 2 (Purchasing & Creating)
```

### Flow 2: Purchasing & Creating a Scene

```
1. User clicks empty slot → ExtendStoryModal
   └─ Explains pricing, 1-hour window, 50% refund policy

2. User confirms → Lock acquisition
   ├─ POST /api/scenes/{parentId}/lock
   │  ├─ Tries INSERT INTO scenes (unique constraint = atomic lock)
   │  ├─ Success: locked_until = NOW() + 1 minute
   │  └─ Returns { sceneId, locked: true }
   └─ Lock acquired!

3. Base payment modal appears (wagmi)
   ├─ Contract: VideoAdventure.sol
   ├─ Function: claimSlot(parentId, slotIndex)
   ├─ Value: 0.000056 ETH (SCENE_PRICE)
   └─ User confirms in wallet

4. Transaction broadcasts to Base
   ├─ wagmi tracks transaction hash
   └─ Waits for confirmation

5. Transaction confirmed → Payment verification
   ├─ POST /api/scenes/verify-payment
   │  ├─ Body: { sceneId, transactionHash, userAddress }
   │  ├─ Backend queries Base blockchain
   │  ├─ Verifies: transaction exists, correct amount, correct function
   │  └─ Creates scene_generation_attempts row
   ├─ Sets retry_window_expires_at = NOW() + 1 hour
   └─ Returns { attemptId }

6. Navigate to /movie/{slug}/create?attemptId={id}&sceneId={id}
   └─ Prompt submission page (not shown in provided files)

7. User enters prompt
   ├─ GPT-4o-mini refines prompt
   ├─ User accepts refinement
   └─ POST /api/prompts (creates prompts row)

8. Video generation starts
   ├─ Calls video generation API
   ├─ Stores video_job_id in prompts table
   └─ Navigate to /movie/{slug}/generating?promptId={id}

9. Generation page polls job status
   ├─ Every 5 seconds: GET job status
   ├─ On success:
   │  ├─ Downloads video
   │  ├─ Uploads to R2
   │  ├─ Updates scene status = 'completed'
   │  └─ Navigate back to watch page
   └─ On failure:
      ├─ Shows error message
      ├─ User can retry (new prompt, same attempt)
      └─ If 1 hour expires: 50% refund, slot reopens
```

### Flow 3: Resuming an Active Attempt

```
1. User connects wallet
   └─ WatchMovie checks /api/user/active-attempts

2. If active attempts found:
   ├─ Green banner appears at top
   ├─ Shows slot letter, status (prompt/generating)
   └─ "Resume" button

3. User clicks Resume
   ├─ If latest prompt is generating:
   │  └─ Navigate to /movie/{slug}/generating?promptId={id}
   └─ If no active prompt:
      └─ Navigate to /movie/{slug}/create?attemptId={id}

4. User can:
   ├─ Submit new prompt (if previous failed)
   ├─ Watch generation progress
   └─ Wait for completion or retry window expiration
```

### Flow 4: Navigation & History

```
1. User watches scene A
   └─ sceneHistory = []

2. User selects Slot B → Scene B plays
   └─ sceneHistory = [Scene A]

3. User selects Slot A → Scene B-A plays
   └─ sceneHistory = [Scene A, Scene B]

4. User swipes up (or taps Back)
   ├─ handleBack() pops last scene from history
   ├─ sceneHistory = [Scene A]
   ├─ Sets currentScene = Scene B
   └─ Shows SwipeableSlotChoice immediately (no video replay)

5. User can continue back
   └─ Eventually reaches genesis (sceneHistory = [])

6. If sceneHistory.length === 0:
   └─ Back button hidden (no "up" swipe option)
```

---

## Payment & Blockchain Integration

### Smart Contract

**Contract Name:** VideoAdventure.sol (not in codebase, assumed deployed)

**Key Function:**
```solidity
function claimSlot(uint256 parentId, uint256 slotIndex) public payable {
  require(msg.value == SCENE_PRICE, "Incorrect payment");
  require(slotIndex < 3, "Invalid slot");

  // Emit event for off-chain tracking
  emit SlotClaimed(parentId, slotIndex, msg.sender, msg.value);

  // Revenue distribution logic (parent, grandparent, great-grandparent, movie creator, platform)
  // ...
}
```

**Contract Address:**
```
process.env.NEXT_PUBLIC_CONTRACT_ADDRESS
```

**ABI:** `lib/VideoAdventure.abi.json`

### Payment Verification Flow

**Why verify on-chain?**
- Frontend can be manipulated
- User might send wrong amount
- Transaction might fail
- Need cryptographic proof of payment

**Verification Process (app/api/scenes/verify-payment/route.ts - assumed):**

```typescript
1. Receive transaction hash from frontend
2. Query Base blockchain using viem:
   const receipt = await publicClient.getTransactionReceipt({ hash });
3. Verify:
   ✓ Transaction succeeded (status === 'success')
   ✓ To address matches contract
   ✓ Value matches SCENE_PRICE
   ✓ Function selector matches claimSlot
   ✓ Args match (parentId, slotIndex)
4. Extract logs/events from receipt
5. Create scene_generation_attempts row
6. Update scene status to 'awaiting_prompt'
7. Return { attemptId } to frontend
```

**Security:**
- Backend independently verifies (doesn't trust frontend)
- Checks actual blockchain state
- Prevents replay attacks (transaction hash UNIQUE constraint)
- Prevents underpayment

### Revenue Distribution

**Per Scene Sale (0.007 ETH = $14 at $2000/ETH):**

```
Scene Creator Revenue (35% total):
├─ Parent scene creator: 20% (0.0014 ETH)
├─ Grandparent scene creator: 10% (0.0007 ETH)
└─ Great-grandparent scene creator: 5% (0.00035 ETH)

Movie Creator Revenue: ~55% (0.00385 ETH)
├─ Earns from EVERY scene in their universe
└─ Incentive to create popular movies

Platform Revenue: ~10% (0.0007 ETH)
├─ Plus 1-2 ETH upfront deposit per movie
└─ Covers moderation, infrastructure, development
```

**Break-Even Example (from AboutModal):**
```
Your scene: 0.007 ETH
├─ Direct children (20% × 3 slots): 0.0042 ETH
├─ Grandchildren (10% × 9 slots): 0.0063 ETH
└─ Great-grandchildren (5% × 27 slots): 0.00675 ETH

Total potential: 0.01925 ETH (2.75x your investment)
Break-even: ~4 descendant scenes
```

**Smart Contract Distribution:**
- Automatic on each `claimSlot()` call
- No manual withdrawals needed
- Revenue streams to creators instantly

---

## Theming System

### Architecture

**Data Flow:**
```
Database (movies.color_scheme JSONB)
  ↓
MovieThemeProvider (converts to CSS variables)
  ↓
CSS Variables (--movie-primary, --movie-secondary, ...)
  ↓
Tailwind Utilities (bg-movie-primary, text-movie-text, ...)
  ↓
Components (use Tailwind classes)
```

### Database Storage

**Column:** `movies.color_scheme` (JSONB)

**Example:**
```json
{
  "primary": "#FFD700",      // Gold
  "secondary": "#FFA500",    // Orange
  "accent": "#FF6347",       // Tomato
  "bg": "#000000",           // Black
  "bgOverlay": "rgba(0, 0, 0, 0.8)",
  "text": "#FFFFFF",         // White
  "textMuted": "rgba(255, 255, 255, 0.6)"
}
```

**TypeScript Type (app/types/movie.ts:1-20):**
```typescript
export interface MovieColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  bgOverlay: string;
  text: string;
  textMuted: string;
}

export const DEFAULT_COLOR_SCHEME: MovieColorScheme = {
  primary: '#FFD700',    // Gold (2009 default)
  secondary: '#FFA500',  // Orange
  accent: '#FF6347',     // Tomato red
  bg: '#000000',         // Black
  bgOverlay: 'rgba(0, 0, 0, 0.8)',
  text: '#FFFFFF',
  textMuted: 'rgba(255, 255, 255, 0.6)'
};
```

### Preset Themes (app/types/movie.ts)

```typescript
export const PRESET_COLOR_SCHEMES: Record<string, MovieColorScheme> = {
  '2009': {
    primary: '#FFD700',    // Gold
    secondary: '#FFA500',  // Orange
    accent: '#FF6347',     // Tomato
    bg: '#000000',
    bgOverlay: 'rgba(0, 0, 0, 0.8)',
    text: '#FFFFFF',
    textMuted: 'rgba(255, 255, 255, 0.6)'
  },
  cyberpunk: {
    primary: '#00FFFF',    // Cyan
    secondary: '#FF00FF',  // Magenta
    accent: '#FFFF00',     // Yellow
    bg: '#0D0221',         // Dark purple
    bgOverlay: 'rgba(13, 2, 33, 0.9)',
    text: '#FFFFFF',
    textMuted: 'rgba(255, 255, 255, 0.7)'
  },
  noir: {
    primary: '#FFFFFF',    // White
    secondary: '#C0C0C0',  // Silver
    accent: '#FFD700',     // Gold accent
    bg: '#000000',
    bgOverlay: 'rgba(0, 0, 0, 0.95)',
    text: '#FFFFFF',
    textMuted: 'rgba(255, 255, 255, 0.5)'
  },
  nature: {
    primary: '#32CD32',    // Lime green
    secondary: '#228B22',  // Forest green
    accent: '#FFD700',     // Gold
    bg: '#0F2027',         // Dark blue-green
    bgOverlay: 'rgba(15, 32, 39, 0.85)',
    text: '#F0FFF0',       // Honeydew
    textMuted: 'rgba(240, 255, 240, 0.6)'
  },
  horror: {
    primary: '#8B0000',    // Dark red
    secondary: '#DC143C',  // Crimson
    accent: '#FF4500',     // Orange red
    bg: '#000000',
    bgOverlay: 'rgba(0, 0, 0, 0.95)',
    text: '#FFFFFF',
    textMuted: 'rgba(255, 255, 255, 0.4)'
  }
};
```

### CSS Variable Injection

**MovieThemeProvider Component (app/components/MovieThemeProvider.tsx:20-45):**

```typescript
export function MovieThemeProvider({
  colorScheme,
  children
}: MovieThemeProviderProps) {
  // Convert color scheme object to CSS variables
  const cssVars = colorSchemeToCSS(colorScheme || DEFAULT_COLOR_SCHEME);

  return (
    <div className="h-screen w-full" style={cssVars}>
      {children}
    </div>
  );
}

// Helper function
function colorSchemeToCSS(scheme: MovieColorScheme): React.CSSProperties {
  return {
    '--movie-primary': scheme.primary,
    '--movie-secondary': scheme.secondary,
    '--movie-accent': scheme.accent,
    '--movie-bg': scheme.bg,
    '--movie-bg-overlay': scheme.bgOverlay,
    '--movie-text': scheme.text,
    '--movie-text-muted': scheme.textMuted,
  } as React.CSSProperties;
}
```

### Tailwind Configuration

**Tailwind CSS v4 Setup (app/globals.css:1-50):**

```css
@import "tailwindcss";

@theme {
  /* Map CSS variables to Tailwind utilities */
  --color-movie-primary: var(--movie-primary, #FFD700);
  --color-movie-secondary: var(--movie-secondary, #FFA500);
  --color-movie-accent: var(--movie-accent, #FF6347);
  --color-movie-bg: var(--movie-bg, #000000);
  --color-movie-bg-overlay: var(--movie-bg-overlay, rgba(0, 0, 0, 0.8));
  --color-movie-text: var(--movie-text, #FFFFFF);
  --color-movie-text-muted: var(--movie-text-muted, rgba(255, 255, 255, 0.6));

  /* Font families */
  --font-family-source-code: var(--font-source-code-pro), monospace;
  --font-family-saira: var(--font-saira), sans-serif;
  --font-family-inter: var(--font-inter), sans-serif;

  /* Custom animations */
  --animate-fade-in: fade-in 0.5s ease-out;
  --animate-slide-up: slide-up 0.3s ease-out;
  --animate-fly-in: fly-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  /* ... more animations ... */
}

/* Keyframe definitions */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
/* ... more keyframes ... */
```

### Usage in Components

**Example 1: SwipeableSlotChoice.tsx (Available Slot Highlight)**
```typescript
// app/components/SwipeableSlotChoice.tsx:530-533
{isAvailable && (
  <div className="absolute inset-0 bg-[var(--movie-primary,#FFD700)] opacity-20 rounded-lg blur-sm" />
)}
```

**Example 2: Direction Arrows**
```typescript
// app/components/SwipeableSlotChoice.tsx:635
<div className={`
  ${isAvailable ? 'text-[var(--movie-primary,#FFD700)]' : 'text-white/60'}
`}>←</div>
```

**Example 3: Using Tailwind Utilities (if configured)**
```typescript
<div className="bg-movie-primary text-movie-text">
  <h1 className="text-movie-primary">Title</h1>
  <p className="text-movie-text-muted">Description</p>
  <button className="bg-movie-accent hover:bg-movie-secondary">
    Click Me
  </button>
</div>
```

### Testing Themes

**Test Page:** `/test-theme` (app/test-theme/page.tsx)

Displays all preset color schemes side-by-side for visual comparison.

---

## API Routes

### Movie Routes

#### `GET /api/movies`

**Purpose:** Fetch movies with filtering, sorting, pagination.

**Query Params:**
- `status`: `draft`, `active`, `paused`, `archived`
- `genre`: Filter by genre
- `search`: Full-text search (title, description, themes)
- `sortBy`: `created_at`, `total_scenes`, `total_views`, `title`
- `sortOrder`: `asc`, `desc`
- `limit`: Results per page (default: 12)
- `offset`: Pagination offset

**Response:**
```json
{
  "movies": [
    {
      "id": 1,
      "slug": "2009",
      "title": "2009: The First Decision",
      "description": "Travel back to the year Bitcoin launched...",
      "cover_image_url": "https://...",
      "genre": "sci-fi",
      "themes": ["time travel", "bitcoin", "decentralization"],
      "total_scenes": 47,
      "total_views": 1234,
      "color_scheme": { "primary": "#FFD700", ... },
      "status": "active",
      "created_at": "2025-01-15T..."
    }
  ],
  "hasMore": true
}
```

### Scene Routes

#### `GET /api/scenes/{sceneId}/slots`

**Purpose:** Fetch all 3 slots for a parent scene + pre-cache video URLs.

**Params:**
- `sceneId`: Parent scene ID or `"genesis"`

**Response:**
```json
{
  "parentId": 5,
  "slots": [
    {
      "slot": "A",
      "exists": true,
      "sceneId": 6,
      "label": "walk to the bedroom",
      "status": "completed",
      "isLocked": false,
      "lockedBy": null,
      "lockedUntil": null,
      "attemptId": null,
      "attemptCreator": null,
      "expiresAt": null,
      "latestPromptId": null,
      "latestPromptOutcome": null,
      "videoUrl": "https://r2.../6.mp4?X-Amz-Signature=..."  // ← For pre-caching
    },
    {
      "slot": "B",
      "exists": false,
      "sceneId": null,
      "label": null,
      "status": null,
      "isLocked": false,
      ...
    },
    {
      "slot": "C",
      "exists": true,
      "sceneId": 8,
      "label": "investigate the noise",
      "status": "generating",
      "isLocked": true,
      "lockedBy": "0xABC...",
      "attemptId": 12,
      "attemptCreator": "0xABC...",
      "latestPromptId": 34,
      "latestPromptOutcome": "generating",
      "videoUrl": null  // ← Not completed yet
    }
  ]
}
```

**Implementation:** `app/api/scenes/[sceneId]/slots/route.ts`

**Key Logic:**
- Calls `getSlotsForScene(parentId)` from `lib/db/scenes.ts`
- ALWAYS generates signed URLs for completed slots (line 28-38)
- 1-hour expiration for signed URLs
- Frontend uses these for pre-caching

#### `GET /api/scenes/{sceneId}/video`

**Purpose:** Get signed URL for a specific scene's video.

**Params:**
- `sceneId`: Scene ID or `"genesis"`

**Response:**
```json
{
  "url": "https://r2.cloudflarestorage.com/scenes/5.mp4?X-Amz-Algorithm=...",
  "expiresAt": "2025-10-23T16:00:00Z"
}
```

**Used By:** `Video.tsx` when `directUrl` prop not provided.

#### `POST /api/scenes/{parentId}/lock`

**Purpose:** Acquire 1-minute lock on a slot before payment.

**Body:**
```json
{
  "slot": "A",
  "userAddress": "0xABC...",
  "fid": 12345
}
```

**Process:**
1. Try INSERT INTO scenes with `locked_until = NOW() + 1 minute`
2. If UNIQUE constraint fails → slot already taken
3. Check if existing lock expired → UPDATE if expired
4. Return `{ sceneId, locked: true }`

**Response:**
```json
{
  "sceneId": 42,
  "locked": true,
  "expiresAt": "2025-10-23T12:01:00Z"
}
```

**Error:**
```json
{
  "error": "Slot already taken",
  "lockedBy": "0xDEF...",
  "expiresAt": "2025-10-23T12:01:00Z"
}
```

#### `POST /api/scenes/verify-payment`

**Purpose:** Verify blockchain transaction and create generation attempt.

**Body:**
```json
{
  "sceneId": 42,
  "transactionHash": "0x123...",
  "userAddress": "0xABC...",
  "fid": 12345
}
```

**Process:**
1. Query Base blockchain for transaction receipt
2. Verify: status=success, to=contract, value=SCENE_PRICE
3. Extract function call data (claimSlot args)
4. Create `scene_generation_attempts` row
5. Set `retry_window_expires_at = NOW() + 1 hour`
6. Update scene status to `awaiting_prompt`

**Response:**
```json
{
  "attemptId": 78,
  "sceneId": 42,
  "expiresAt": "2025-10-23T13:00:00Z"
}
```

#### `GET /api/scenes/tree`

**Purpose:** Fetch entire scene tree for map visualization.

**Query Params:**
- `movieId`: Movie ID (required)
- `viewerAddress`: Wallet address (optional, for marking viewed scenes)

**Response:**
```json
{
  "tree": {
    "id": 1,
    "parentId": null,
    "slot": null,
    "slotLabel": "Intro",
    "status": "completed",
    "creatorAddress": null,
    "viewCount": 1500,
    "viewedByUser": true,
    "children": [
      {
        "id": 2,
        "parentId": 1,
        "slot": "A",
        "slotLabel": "walk to the bedroom",
        "status": "completed",
        "creatorAddress": "0xABC...",
        "viewCount": 450,
        "viewedByUser": true,
        "children": [...]
      },
      ...
    ]
  },
  "totalScenes": 47,
  "cached": true
}
```

**Caching:**
- Tree structure cached for 5 minutes (per movie)
- User views always fresh (separate query)
- Invalidated when new scene created

**Implementation:** `app/api/scenes/tree/route.ts`

#### `POST /api/play`

**Purpose:** Load scene data when user selects a filled slot.

**Body:**
```json
{
  "parentSceneId": 5,
  "slot": "A"
}
```

**Response:**
```json
{
  "sceneId": 6,
  "videoUrl": "https://r2.../6.mp4?...",  // Signed URL
  "slotLabel": "walk to the bedroom",
  "creatorAddress": "0xABC...",
  "creatorFid": 12345,
  "createdAt": "2025-10-20T15:30:00Z"
}
```

### User Routes

#### `GET /api/user/active-attempts`

**Purpose:** Check if connected user has any in-progress generation attempts.

**Query Params:**
- `address`: Wallet address

**Response (has attempts):**
```json
{
  "hasActiveAttempts": true,
  "attempts": [
    {
      "attemptId": 78,
      "sceneId": 42,
      "slot": "B",
      "expiresAt": "2025-10-23T13:00:00Z",
      "resumePage": "prompt",  // or "generating"
      "resumeUrl": "/movie/2009/create?attemptId=78&sceneId=42",
      "latestPromptId": 145,
      "latestPromptOutcome": "pending"
    }
  ]
}
```

**Response (no attempts):**
```json
{
  "hasActiveAttempts": false,
  "attempts": []
}
```

**Used By:** `WatchMovie.tsx:41-70` (shows resume banner)

---

## State Management

### Global State (Providers)

#### OnchainKitProvider + WagmiProvider

**Location:** `app/layout.tsx:50-80`

**Purpose:** Wallet connection, Base chain interactions.

**Setup:**
```typescript
const config = getDefaultConfig({
  appName: '2009',
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID!,
  chains: [base],
  ssr: true,
});

<WagmiProvider config={config}>
  <QueryClientProvider client={queryClient}>
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
      chain={base}
      config={{ appearance: { mode: 'dark' } }}
    >
      {children}
    </OnchainKitProvider>
  </QueryClientProvider>
</WagmiProvider>
```

**Hooks Available:**
- `useAccount()` → `{ address, isConnected }`
- `useWriteContract()` → Call smart contract functions
- `useWaitForTransactionReceipt()` → Wait for tx confirmation
- `useEnsName()` → Resolve ENS names

#### MovieThemeProvider

**Location:** `app/components/MovieThemeProvider.tsx`

**Purpose:** Inject per-movie CSS variables.

**Usage:**
```typescript
// app/movie/[slug]/page.tsx:58-65
<MovieThemeProvider colorScheme={movie.color_scheme}>
  <WatchMovie
    movieId={movie.id}
    movieSlug={movie.slug}
    genesisSceneId={movie.genesis_scene_id}
  />
</MovieThemeProvider>
```

### Component-Level State

#### WatchMovie State

**Critical State Variables:**

```typescript
// Scene management
const [currentScene, setCurrentScene] = useState<SceneData | null>(null);
const [parentSceneId, setParentSceneId] = useState<number | 'genesis'>(genesisSceneId);
const [previousSceneId, setPreviousSceneId] = useState<number | null>(null);

// History for back button
const [sceneHistory, setSceneHistory] = useState<SceneData[]>([]);

// UI control
const [showVideo, setShowVideo] = useState(true);
const [showPopup, setShowPopup] = useState(false);

// Performance optimization
const [preloadedSlots, setPreloadedSlots] = useState<PreloadedSlotsData | null>(null);

// User session
const [activeAttempts, setActiveAttempts] = useState<ActiveAttempt[]>([]);
const [showResumeBanner, setShowResumeBanner] = useState(false);
```

**State Flow Example (Scene Transition):**
```
User selects Slot A
  ↓
handleSlotSelected(sceneData) called
  ↓
1. setShowPopup(false)              // Hide slot modal
2. setPreloadedSlots(null)          // Clear old data
3. setPreviousSceneId(current)      // For analytics
4. setSceneHistory([...prev, current]) // For back button
5. setCurrentScene(sceneData)       // New scene
6. setShowVideo(true)               // Show video
7. setParentSceneId(sceneData.sceneId) // Triggers preload
  ↓
useEffect detects parentSceneId change
  ↓
Fetches /api/scenes/{id}/slots → setPreloadedSlots(data)
  ↓
Another useEffect renders hidden <video> elements
  ↓
Browser starts pre-caching next scenes
```

#### SwipeableSlotChoice State

```typescript
// Slot data
const [slots, setSlots] = useState<SlotInfo[]>([]);
const [isLoading, setIsLoading] = useState(true);
const [loadError, setLoadError] = useState<string | null>(null);

// Payment flow
const [lockSceneId, setLockSceneId] = useState<number | null>(null);
const [statusMessage, setStatusMessage] = useState<string>('');
const [loadingSlot, setLoadingSlot] = useState<'A' | 'B' | 'C' | null>(null);

// Gesture tracking
const [isDragging, setIsDragging] = useState(false);
const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);

// Modal states
const [showExtendModal, setShowExtendModal] = useState(false);
const [pendingSlot, setPendingSlot] = useState<{ slot: 'A' | 'B' | 'C', index: number } | null>(null);
```

#### Video State

```typescript
// Video URL management
const [videoUrl, setVideoUrl] = useState<string | null>(null);
const [expiresAt, setExpiresAt] = useState<Date | null>(null);

// Loading states
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

// Playback states
const [isMuted, setIsMuted] = useState(true);
const [needsManualPlay, setNeedsManualPlay] = useState(false);

// Analytics
const [hasTrackedView, setHasTrackedView] = useState(false);
```

### Data Flow Patterns

#### Pattern 1: Prop Drilling (Parent → Child)

```
WatchMovie
  ├─ currentScene → Video (as props)
  │   ├─ sceneId
  │   ├─ directUrl (videoUrl)
  │   ├─ creatorAddress
  │   └─ ...
  │
  └─ preloadedSlots → SwipeableSlotChoice
      └─ Used for instant playback
```

#### Pattern 2: Callback Props (Child → Parent)

```
SwipeableSlotChoice
  └─ onSlotSelected={(sceneData) => ...}
      ↓
WatchMovie.handleSlotSelected()
  └─ Updates state, triggers new scene
```

#### Pattern 3: URL State (Server ↔ Client)

```
URL: /movie/2009/create?attemptId=78&sceneId=42
  ↓
useSearchParams() extracts attemptId, sceneId
  ↓
Component fetches data from API
  ↓
Displays UI based on fetched data
```

---

## Performance Optimizations

### 1. Video Pre-Caching

**Impact:** 13x faster scene transitions (~0.2s vs ~2.7s)

**Mechanism:**
- Fetch slot data during current video playback
- Create hidden `<video preload="auto">` elements
- Browser downloads videos in background
- Next scene plays instantly from cache

**Code:** See [Video System → Pre-Caching System](#pre-caching-system)

### 2. Scene Tree Caching

**Purpose:** Reduce database load for scene map.

**Strategy:**
```typescript
// Cache structure (per movie)
const cache = new Map<number, {
  tree: SceneNode;
  timestamp: number;
  totalScenes: number
}>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

**Logic (app/api/scenes/tree/route.ts:47-61):**
```typescript
// Check cache
const cached = cache.get(movieId);
const now = Date.now();
const useCache = cached && (now - cached.timestamp) < CACHE_TTL;

if (useCache && cached) {
  console.log(`✅ Cache hit for movie ${movieId}`);
  treeData = JSON.parse(JSON.stringify(cached.tree)); // Deep clone
  totalScenes = cached.totalScenes;
} else {
  // Fetch from database
  // Build tree
  // Update cache
  cache.set(movieId, { tree, timestamp: now, totalScenes });
}
```

**Invalidation:**
```typescript
// Call when new scene created
export function invalidateMovieCache(movieId: number) {
  cache.delete(movieId);
  console.log(`🗑️ Invalidated cache for movie ${movieId}`);
}
```

**Benefits:**
- Reduces DB queries from O(users) to O(1 per 5 minutes)
- Fast map loading for all users
- User-specific views still fresh (separate query)

### 3. Signed URL Auto-Refresh

**Problem:** Videos use 1-hour signed URLs → playback breaks after expiry.

**Solution:** Auto-refresh at 55-minute mark.

**Implementation (app/components/Video.tsx:104-120):**
```typescript
useEffect(() => {
  if (!expiresAt) return;

  const now = Date.now();
  const expiryTime = expiresAt.getTime();
  const refreshTime = expiryTime - 5 * 60 * 1000; // 5 min buffer
  const timeUntilRefresh = refreshTime - now;

  if (timeUntilRefresh > 0) {
    const timer = setTimeout(() => {
      fetchVideoUrl(); // Fetch new signed URL
    }, timeUntilRefresh);

    return () => clearTimeout(timer);
  }
}, [expiresAt]);
```

**Benefits:**
- Seamless playback for long sessions
- No manual refresh needed
- Prevents "video not found" errors

### 4. Lazy Lock Expiration

**Problem:** Background jobs are complex to manage.

**Solution:** Handle lock expiration lazily on next acquisition attempt.

**Logic:**
```typescript
// When user tries to acquire lock:
1. Check if slot exists
2. If exists, check if locked_until < NOW()
3. If expired, UPDATE row (reuse existing)
4. If not expired, return error "Slot taken"
```

**Benefits:**
- No cron jobs or background workers
- Simple, predictable behavior
- Database handles timing automatically

### 5. Parallel Tool Calls

**Example: WatchMovie Initialization**
```typescript
// BAD (sequential):
const statusResponse = await fetch('/api/status');
const attemptsResponse = await fetch('/api/user/active-attempts');
const slotsResponse = await fetch('/api/scenes/0/slots');
// Total: 600ms (3 × 200ms)

// GOOD (parallel):
const [statusResponse, attemptsResponse, slotsResponse] = await Promise.all([
  fetch('/api/status'),
  fetch('/api/user/active-attempts'),
  fetch('/api/scenes/0/slots')
]);
// Total: 200ms (max of 3 requests)
```

### 6. Database Indexes

**Key Indexes (schema.md:175-183):**
```sql
CREATE INDEX idx_scenes_movie_id ON scenes(movie_id);
CREATE INDEX idx_scenes_parent_id ON scenes(parent_id);
CREATE INDEX idx_scenes_status ON scenes(status);
CREATE INDEX idx_scenes_locked_until ON scenes(locked_until);

CREATE INDEX idx_scene_views_scene_id ON scene_views(scene_id);
CREATE INDEX idx_scene_views_viewed_at ON scene_views(viewed_at);
CREATE INDEX idx_scene_views_scene_viewed ON scene_views(scene_id, viewed_at DESC);
```

**Impact:**
- Slot queries: O(1) lookup via `(parent_id, slot)` unique index
- Tree queries: Fast traversal via `parent_id` index
- Analytics: Fast aggregations via composite indexes

### 7. React Optimization Patterns

**useEffect Cleanup:**
```typescript
useEffect(() => {
  let cancelled = false;

  async function doWork() {
    const result = await fetch('...');
    if (!cancelled) {
      setState(result);
    }
  }

  doWork();

  return () => {
    cancelled = true; // Prevent state updates after unmount
  };
}, [deps]);
```

**Prevents:**
- "Can't perform state update on unmounted component" warnings
- Race conditions when effects re-run quickly

---

## Analytics & Tracking

### Scene Views Table

**Purpose:** Track every scene view for engagement analysis.

**Schema (schema.md:85-115):**
```sql
CREATE TABLE scene_views (
  id SERIAL PRIMARY KEY,
  scene_id INTEGER NOT NULL REFERENCES scenes(id),
  viewer_address TEXT,        -- NULL if not connected
  viewer_fid INTEGER,         -- NULL if not available
  session_id UUID NOT NULL,   -- Client-generated UUID
  viewed_at TIMESTAMP DEFAULT NOW(),
  referrer_scene_id INTEGER,  -- Previous scene (path tracking)
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Client-Side Tracking

**Implementation (lib/analytics.ts - assumed):**
```typescript
export async function trackSceneView(params: {
  sceneId: number;
  viewerAddress?: string;
  viewerFid?: number;
  referrerSceneId?: number;
}): Promise<boolean> {
  try {
    // Get or create session ID (30-minute window)
    const sessionId = getOrCreateSessionId();

    const response = await fetch('/api/analytics/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sceneId: params.sceneId,
        viewerAddress: params.viewerAddress,
        viewerFid: params.viewerFid,
        sessionId,
        referrerSceneId: params.referrerSceneId
      })
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to track view:', error);
    return false;
  }
}

function getOrCreateSessionId(): string {
  const key = '2009_session_id';
  const expiryKey = '2009_session_expiry';

  let sessionId = localStorage.getItem(key);
  const expiry = localStorage.getItem(expiryKey);

  const now = Date.now();
  const sessionDuration = 30 * 60 * 1000; // 30 minutes

  if (!sessionId || !expiry || now > parseInt(expiry)) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(key, sessionId);
  }

  localStorage.setItem(expiryKey, (now + sessionDuration).toString());

  return sessionId;
}
```

**Call Site (app/components/Video.tsx:161-172):**
```typescript
useEffect(() => {
  // ... autoplay logic ...

  // Track view (only once per scene load)
  if (!hasTrackedView && sceneId !== null) {
    trackSceneView({
      sceneId,
      viewerAddress,
      viewerFid,
      referrerSceneId
    }).then((success) => {
      if (success && !cancelled) {
        setHasTrackedView(true);
      }
    });
  }

  return () => { cancelled = true; };
}, [isVisible, videoUrl, hasTrackedView, ...]);
```

### Session Management

**Session ID Generation:**
- Client generates UUID on first visit
- Stored in localStorage
- 30-minute expiry (sliding window)
- New session after 30 minutes of inactivity

**Use Cases:**
1. **User Journey Analysis**
   ```sql
   SELECT sv.session_id, array_agg(s.slot_label ORDER BY sv.viewed_at)
   FROM scene_views sv
   JOIN scenes s ON sv.scene_id = s.id
   WHERE sv.session_id = 'abc123...'
   GROUP BY sv.session_id;

   -- Result: ["Intro", "walk to bedroom", "investigate noise", ...]
   ```

2. **Popular Paths**
   ```sql
   SELECT
     s1.slot_label as from_scene,
     s2.slot_label as to_scene,
     COUNT(*) as transitions
   FROM scene_views sv1
   JOIN scene_views sv2 ON sv1.session_id = sv2.session_id
   JOIN scenes s1 ON sv1.scene_id = s1.id
   JOIN scenes s2 ON sv2.scene_id = s2.id
   WHERE sv2.viewed_at > sv1.viewed_at
   GROUP BY s1.slot_label, s2.slot_label
   ORDER BY transitions DESC
   LIMIT 10;
   ```

3. **Drop-off Points**
   ```sql
   SELECT
     s.slot_label,
     COUNT(*) as views,
     COUNT(DISTINCT sv.session_id) as unique_sessions,
     (SELECT COUNT(*) FROM scene_views sv2
      WHERE sv2.session_id = sv.session_id
      AND sv2.viewed_at > sv.viewed_at) as continued
   FROM scene_views sv
   JOIN scenes s ON sv.scene_id = s.id
   GROUP BY s.id, s.slot_label
   ORDER BY (views - continued) DESC;
   ```

### Aggregate Counts

**Problem:** Querying `scene_views` for every scene load is slow.

**Solution:** Cached count in `scenes.view_count`.

**Update Strategy (triggered by analytics API):**
```sql
UPDATE scenes
SET view_count = view_count + 1
WHERE id = $1;
```

**Benefits:**
- Fast reads (no JOIN needed)
- Real-time-ish (updated on each view)
- Can rebuild from `scene_views` if needed:
  ```sql
  UPDATE scenes s
  SET view_count = (
    SELECT COUNT(*)
    FROM scene_views sv
    WHERE sv.scene_id = s.id
  );
  ```

---

## Navigation & Routing

### Route Structure

```
/ (Homepage)
├─ app/page.tsx (Server Component)
└─ Renders Home.tsx (Client Component)

/movie/{slug} (Movie Player)
├─ app/movie/[slug]/page.tsx (Server Component)
│  ├─ Fetches movie from database
│  ├─ Validates status (active/draft/paused/archived)
│  └─ Wraps in MovieThemeProvider
└─ Renders WatchMovie.tsx (Client Component)

/movie/{slug}/create (Prompt Submission)
├─ app/movie/[slug]/create/page.tsx
└─ Query params: ?attemptId=78&sceneId=42

/movie/{slug}/generating (Generation Progress)
├─ app/movie/[slug]/generating/page.tsx
└─ Query params: ?promptId=145&sceneId=42

/scene/{id} (Direct Scene Link - for sharing)
├─ app/scene/[id]/page.tsx
└─ Fetches scene, redirects to /movie/{slug} with scene loaded

/test-theme (Theme Testing)
└─ app/test-theme/page.tsx
```

### Dynamic Route Parameters

**Pattern:** `[slug]` in directory name = dynamic segment

**Example: /movie/[slug]/page.tsx**
```typescript
interface MoviePageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function MoviePage({ params }: MoviePageProps) {
  const { slug } = await params;

  // Fetch movie by slug
  const movie = await getMovieBySlug(slug);

  // ...
}
```

### Query Parameters

**Pattern:** `useSearchParams()` from `next/navigation`

**Example: /movie/2009/create?attemptId=78&sceneId=42**
```typescript
'use client';

import { useSearchParams } from 'next/navigation';

export default function CreatePage() {
  const searchParams = useSearchParams();
  const attemptId = searchParams.get('attemptId'); // "78"
  const sceneId = searchParams.get('sceneId');     // "42"

  // ...
}
```

### Programmatic Navigation

**Using `useRouter` from `next/navigation`:**
```typescript
import { useRouter } from 'next/navigation';

const router = useRouter();

// Navigate to new page
router.push('/movie/2009');

// Navigate with query params
router.push(`/movie/${slug}/create?attemptId=${id}&sceneId=${sceneId}`);

// Go back
router.back();

// Refresh current page (re-fetch Server Components)
router.refresh();
```

**Example: SwipeableSlotChoice Payment Flow**
```typescript
// app/components/SwipeableSlotChoice.tsx:354-356
router.push(`/movie/${movieSlug}/create?attemptId=${data.attemptId}&sceneId=${lockSceneId}`);
```

### Server Components vs Client Components

**Server Components (default):**
- Run on server only
- Can access database directly
- Cannot use hooks (useState, useEffect, etc.)
- Better performance (less JS sent to client)

**Example:**
```typescript
// app/movie/[slug]/page.tsx
export default async function MoviePage({ params }: MoviePageProps) {
  const { slug } = await params;

  // Direct database access (server-side)
  const movie = await getMovieBySlug(slug);

  // ...
}
```

**Client Components:**
- Run on client (browser)
- Can use React hooks
- Can access browser APIs (localStorage, etc.)
- Need `'use client'` directive at top

**Example:**
```typescript
// app/components/Video.tsx
'use client';

import { useState, useEffect } from 'react';

export default function Video({ ... }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  // ...
}
```

**Pattern: Server Component wraps Client Component**
```typescript
// Server Component (fetches data)
export default async function MoviePage({ params }) {
  const movie = await getMovieBySlug(params.slug);

  // Pass data to Client Component
  return (
    <MovieThemeProvider colorScheme={movie.color_scheme}>
      <WatchMovie
        movieId={movie.id}
        movieSlug={movie.slug}
        genesisSceneId={movie.genesis_scene_id}
      />
    </MovieThemeProvider>
  );
}
```

---

## Error Handling

### Video Playback Errors

#### Autoplay Policy Blocks

**Problem:** Browsers block autoplay of unmuted videos.

**Solution (app/components/Video.tsx:136-154):**
```typescript
const attemptPlay = async () => {
  try {
    await videoRef.current!.play();
    setNeedsManualPlay(false);
  } catch (err: any) {
    if (cancelled) return;

    // Discriminate: only show button for REAL autoplay blocks
    const isInterruption =
      err.name === 'AbortError' ||
      err.message?.includes('interrupted') ||
      err.message?.includes('aborted');

    if (!isInterruption) {
      console.error('Video autoplay blocked by browser:', err.message);
      setNeedsManualPlay(true); // Show "Click to Play" button
    }
  }
};
```

**Why Discriminate?**
- Rapid scene changes cause AbortError (normal behavior)
- Only show manual button for actual policy blocks
- Prevents annoying UI flicker

#### Video Load Failures

**Scenarios:**
- Signed URL expired
- R2 unavailable
- Network error

**Handling (app/components/Video.tsx:226-239):**
```typescript
{error && (
  <div className="...">
    <p>{error}</p>
    <button onClick={fetchVideoUrl}>
      Retry
    </button>
  </div>
)}
```

**Auto-Refresh Prevention:**
```typescript
useEffect(() => {
  if (!expiresAt) return;

  // Refresh 5 minutes before expiry
  const refreshTime = expiresAt.getTime() - 5 * 60 * 1000;

  // ...
}, [expiresAt]);
```

### Payment Flow Errors

#### Lock Acquisition Failures

**Causes:**
- Slot already taken (race condition)
- Lock expired during payment
- Network error

**Handling (app/components/SwipeableSlotChoice.tsx:296-302):**
```typescript
if (!lockResponse.ok) {
  const error = await lockResponse.json();
  alert(error.error || 'Failed to acquire lock');
  setStatusMessage('');
  return;
}
```

#### Transaction Failures

**Causes:**
- User rejected transaction
- Insufficient funds
- Gas estimation failed

**Handling (app/components/SwipeableSlotChoice.tsx:369-375):**
```typescript
useEffect(() => {
  if (error) {
    console.error("Transaction error:", error);
    alert(`Transaction failed: ${error.message}`);
    setStatusMessage('');
  }
}, [error]);
```

#### Payment Verification Failures

**Causes:**
- Transaction hash not found
- Incorrect amount sent
- Contract verification failed

**Handling (app/components/SwipeableSlotChoice.tsx:344-362):**
```typescript
const response = await fetch('/api/scenes/verify-payment', {
  method: 'POST',
  body: JSON.stringify({ sceneId, transactionHash, userAddress })
});

if (!response.ok) {
  const error = await response.json();
  alert(error.error || 'Payment verification failed');
  setStatusMessage('');
  return;
}
```

### API Error Handling

#### Fetch Errors

**Pattern:**
```typescript
try {
  const response = await fetch('/api/...');

  if (!response.ok) {
    throw new Error('Failed to fetch');
  }

  const data = await response.json();
  // Use data...

} catch (err) {
  console.error('Error:', err);
  setError(err instanceof Error ? err.message : 'Unknown error');
}
```

#### Abort Controller (Cleanup)

**Purpose:** Prevent state updates when component unmounts.

**Example (app/components/Home.tsx:24-77):**
```typescript
useEffect(() => {
  const abortController = new AbortController();

  async function fetchMovies() {
    try {
      const response = await fetch(`/api/movies?...`, {
        signal: abortController.signal, // ← Abort signal
      });

      // ...
      setMovies(data.movies);

    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err.message);
    }
  }

  fetchMovies();

  return () => {
    abortController.abort(); // ← Cleanup
  };
}, [deps]);
```

### Database Errors

#### Unique Constraint Violations

**Scenario:** Two users try to claim same slot simultaneously.

**Handling (database level):**
```sql
-- Attempt INSERT
INSERT INTO scenes (movie_id, parent_id, slot, locked_until, ...)
VALUES (1, 5, 'A', NOW() + INTERVAL '1 minute', ...);

-- If UNIQUE(parent_id, slot) violated:
-- ERROR: duplicate key value violates unique constraint "unique_parent_slot"
```

**API Response:**
```typescript
try {
  await pool.query('INSERT INTO scenes ...');
} catch (error) {
  if (error.code === '23505') { // Unique violation
    return NextResponse.json(
      { error: 'Slot already taken' },
      { status: 409 } // Conflict
    );
  }
  throw error;
}
```

#### Foreign Key Violations

**Scenario:** Trying to create scene with non-existent parent.

**Handling:**
```typescript
try {
  await pool.query('INSERT INTO scenes (parent_id, ...) VALUES ($1, ...)', [parentId]);
} catch (error) {
  if (error.code === '23503') { // FK violation
    return NextResponse.json(
      { error: 'Parent scene not found' },
      { status: 404 }
    );
  }
  throw error;
}
```

### User Experience Errors

#### Wallet Not Connected

**Check:**
```typescript
if (!isConnected || !address) {
  alert("Please connect your wallet first!");
  return;
}
```

**Visual Feedback:**
```typescript
{!isConnected && (
  <div className="...">
    <p>🔒 Wallet Connection Required</p>
  </div>
)}
```

#### Slot State Errors

**Scenario:** User tries to interact with locked slot.

**Prevention (app/components/SwipeableSlotChoice.tsx:173-179):**
```typescript
if (slotInfo.attemptId || slotInfo.isLocked || ...) {
  return {
    type: 'locked',
    canInteract: false, // ← Prevents interaction
    label: 'being created...',
    action: null
  };
}
```

**UI Rendering:**
```typescript
className={`${slotState.canInteract ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
```

---

## Development Environment

### Required Environment Variables

**`.env.local`:**
```bash
# Database
POSTGRES_URL=postgresql://user:pass@host/db?sslmode=require

# R2 Storage
AWS_S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_S3_BUCKET_NAME=scenes
R2_PUBLIC_URL=https://scenes.your-domain.com  # Optional

# Base Blockchain
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_SCENE_PRICE=0.000056

# OnchainKit (Base)
NEXT_PUBLIC_ONCHAINKIT_API_KEY=xxx

# WalletConnect
NEXT_PUBLIC_WC_PROJECT_ID=xxx

# App URL
NEXT_PUBLIC_URL=http://localhost:3001
```

### Development Server

**Start:**
```bash
npm run dev
```

**Runs on:** http://localhost:3001

**Why 3001?**
- Configured in `package.json`:
  ```json
  "scripts": {
    "dev": "next dev -p 3001"
  }
  ```

### Database Migrations

**Run migrations:**
```bash
POSTGRES_URL=xxx npm run db:migrate
```

**Migration files:**
```
migrations/
├── 001_initial_schema.sql          # Legacy two-tier
└── 002_refactor_to_three_tier.sql  # Current four-tier
```

**Migration script (assumed in package.json):**
```json
"scripts": {
  "db:migrate": "node scripts/migrate.js"
}
```

### Tailwind CSS v4

**Configuration:** CSS-based (no `tailwind.config.js`)

**PostCSS Setup (postcss.config.js):**
```javascript
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {}
  },
};
```

**Theme Configuration (app/globals.css):**
```css
@import "tailwindcss";

@theme {
  /* Colors, fonts, animations defined here */
  --color-movie-primary: var(--movie-primary, #FFD700);
  /* ... */
}
```

### Debugging

**Console Logs (Cleaned Up):**
- All debug `console.log` removed (2025-10-23)
- Only `console.error` for real errors
- Example: `console.error('Video autoplay blocked:', err.message);`

**React DevTools:**
- Component tree inspection
- State/props debugging
- Performance profiling

**Network Tab:**
- API request inspection
- Video loading monitoring
- Signed URL examination

**Database Queries:**
- Use PostgreSQL client to inspect data
- Check indexes: `EXPLAIN ANALYZE SELECT ...`

---

## Recent Fixes & Improvements

### 2025-10-23

#### 1. Fixed React Hydration Mismatch
**Problem:** Providers outside `<html>/<body>` causing hydration errors.

**Solution (app/layout.tsx):**
```typescript
// BEFORE: Providers wrapping <html>
<Providers>
  <html>...</html>
</Providers>

// AFTER: Providers inside <body>
<html suppressHydrationWarning>
  <body>
    <Providers>
      {children}
    </Providers>
  </body>
</html>
```

#### 2. Fixed Video Invisible Bug
**Problem:** Video not visible due to height cascade bug.

**Solution (app/components/MovieThemeProvider.tsx:37):**
```typescript
// BEFORE:
<div className="min-h-screen w-full" style={cssVars}>

// AFTER:
<div className="h-screen w-full" style={cssVars}>
```

**Why:** `min-h-screen` allows content to shrink, `h-screen` forces full height.

#### 3. Cleaned Up Debug Console Logs
**Removed all:**
- `console.log('✅ ...')`
- `console.log('Fetching...')`
- `console.log('Preloading...')`

**Kept only:**
- `console.error(...)` for real errors
- Server-side logs for monitoring

#### 4. Removed Dead Code
**Deleted:** `app/components/SlotChoiceModal.tsx` (replaced by SwipeableSlotChoice)

#### 5. Fixed Video Play Interruption Errors
**Problem:** Rapid scene changes causing AbortError spam.

**Solution:** Smart error discrimination (app/components/Video.tsx:146-154)
```typescript
const isInterruption =
  err.name === 'AbortError' ||
  err.message?.includes('interrupted') ||
  err.message?.includes('aborted');

if (!isInterruption) {
  console.error('Video autoplay blocked:', err.message);
  setNeedsManualPlay(true);
}
```

#### 6. Enhanced Manual Play Button
**Improvement:** Better loading state handling.

**Code (app/components/Video.tsx:185-194):**
```typescript
// Ensure video is loaded before playing
if (videoRef.current.readyState < 2) {
  await new Promise((resolve) => {
    const handleCanPlay = () => {
      videoRef.current?.removeEventListener('canplay', handleCanPlay);
      resolve(undefined);
    };
    videoRef.current?.addEventListener('canplay', handleCanPlay);
    videoRef.current?.load();
  });
}
```

---

## Future Considerations

### Scalability

**Database:**
- Add read replicas for high traffic
- Partition `scene_views` by date (time-series data)
- Consider Redis cache for hot data

**Video Storage:**
- CDN in front of R2 for global distribution
- Video transcoding (multiple resolutions)
- Thumbnail generation for preview

**API:**
- Rate limiting per user/IP
- Request queuing for generation endpoints
- Websockets for real-time updates (instead of polling)

### Features

**Prompt Refinement:**
- Implement GPT-4o-mini integration (currently stub)
- Show refinement suggestions to user
- Allow iterative refinement

**Generation Progress:**
- Real-time progress updates (websockets)
- Estimated time remaining
- Preview frames during generation

**Social Features:**
- User profiles (created scenes, favorites)
- Comments on scenes
- Reactions/likes
- Leaderboards (most viewed, highest earnings)

**Discovery:**
- Trending scenes/movies
- Recommended paths based on history
- Search within movies

### Optimization

**Code Splitting:**
- Dynamic imports for heavy components
- Route-based code splitting (already done by Next.js)

**Image Optimization:**
- Next.js Image component for cover images
- WebP format with fallbacks

**Bundle Size:**
- Tree-shake unused OnchainKit components
- Lazy load modals (AboutModal, SceneMapModal)

### Monitoring

**Error Tracking:**
- Sentry or similar (client + server errors)
- Alert on payment verification failures

**Analytics:**
- Real-time dashboards (Grafana + PostgreSQL)
- Conversion funnel (view → click → pay → complete)
- Revenue tracking per movie/creator

**Performance:**
- Core Web Vitals monitoring
- API endpoint latency tracking
- Video buffering metrics

---

## Conclusion

This architecture document provides a comprehensive overview of the 2009 platform as of October 23, 2025. The system is built on a solid foundation of:

- **Four-tier database** for flexibility and audit trails
- **Pre-caching system** for instant playback
- **Blockchain integration** for trustless payments
- **Per-movie theming** for visual diversity
- **Mobile-first gestures** for intuitive navigation

All core functionality is working, with recent fixes improving stability and user experience. The codebase is clean, well-structured, and ready for future enhancements.

---

**Maintained by:** Development Team
**Last Review:** 2025-10-23
**Next Review:** When significant changes occur
