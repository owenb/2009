# 2009: A Create Your Own Adventure Game

## Concept

A first-of-its-kind "create your own adventure" game set in the year 2009 when Bitcoin has just been launched. The game is framed around the idea that Bitcoin didn't turn out as we hoped—instead of replacing fiat currency, it got co-opted by the very banks we hoped it would replace. Now players can travel back to 2009 and generate new timelines. This interactive experience combines video storytelling with generative AI to create an infinitely extensible world/movie/game where players inject their ideas into the story arc.

## How It Works

### Core Mechanics

1. **Initial Scene**: Users watch a quick intro video (8-second clip/scene)

2. **Extension Slots**: After each scene, three opportunities (slots) appear to extend the narrative
   - Users can purchase a slot to extend the scene with their own AI prompt
   - Once a slot is purchased, it's gone forever
   - Only two slots remain after the first purchase, then one, then none

3. **Infinite Extension**: Once all three slots for a scene are filled:
   - Users must extend another clip further down the timeline
   - This creates an infinitely branching narrative structure
   - The world/movie/game grows organically through user contributions

### Technical Foundation

Built as a Base mini app following the Base platform specifications: https://docs.base.org/llms.txt

### Scene Structure

- Each scene is an 8-second video clip
- Scenes can branch into multiple paths based on user-generated extensions
- Each scene has exactly 3 extension slots (no more, no less)
- Slots are permanently claimed once purchased

### User Journey

1. Watch intro video (8 seconds)
2. See 3 available extension slots
3. Purchase a slot (if available)
4. Submit ideas to be injected into the story arc
5. AI generates the next scene (1 hour with unlimited retries, 50% refund if fails)
6. New scene appears with its own 3 extension slots
7. Repeat infinitely

## Key Features

- **Permanent Choices**: Once a slot is taken, the decision is permanent
- **Collaborative Storytelling**: Multiple users contribute to different branches
- **2009 Setting**: Themed around the launch of Bitcoin and that era
- **AI-Powered Generation**: Uses generative AI to create new scenes from user prompts
- **Infinite Scalability**: The narrative can grow indefinitely in any direction

---

## Architecture

**NOTE:** Everything is in active development and subject to change. We're figuring this out in realtime.

### Documentation
- **`schema.md`** - Database structure and tables (three-tier architecture)
- **`GAME_DESIGN.md`** - Game mechanics, user flows, and design decisions

### Core Principles

1. **Three-Tier Database Architecture**
   ```
   scenes (the slot itself - one row per parent/slot)
     └── scene_generation_attempts (each paid user session)
          └── prompts (each prompt submission)
   ```
   - Allows multiple users to attempt same slot if previous attempts fail
   - Complete audit trail of all generation attempts
   - `UNIQUE(parent_id, slot)` constraint provides atomic lock mechanism

2. **Smart Contract as Source of Truth**
   - Base blockchain smart contract is the ultimate authority for all purchases
   - Database is secondary (for UX and caching)
   - All transactions verified independently on-chain by backend
   - Payment verification happens before prompt submission

3. **Slot Purchase Flow**
   - User clicks empty slot → "Extend the Story" modal with explanation
   - User clicks "Extend now" → **IMMEDIATE lock acquisition** (1 minute)
   - Lock successful → Base payment modal appears
   - Payment submitted → backend verifies tx hash on-chain
   - Verification succeeds → `scene_generation_attempts` row created
   - User enters prompt → **GPT-4o-mini** provides refinement suggestions
   - Refined prompt sent to video API → video generated
   - Video uploaded to R2 → slot marked completed

4. **Generation & Retry Logic**
   - Video API may reject prompts (moderation, rate limits, errors)
   - Users have **1 hour** from payment confirmation to successfully generate
   - Unlimited prompt retries within window (each tracked separately)
   - Each retry creates new `prompts` row under same `scene_generation_attempts`
   - After 1 hour of failures: **50% refund**, attempt marked failed, slot reopens
   - GPT-4o-mini assists with prompt refinement on each attempt

5. **Lock & Expiration Handling**
   - Locks expire after 1 minute if payment not completed
   - Expiration handled lazily (no background jobs)
   - Other users see "Selected by [user]" with countdown during lock
   - Expired locks can be taken over by next user (row reused, not deleted)

6. **Navigation**
   - No tree map view - users must explore by watching scenes
   - Each scene displays creator (ENS name), timestamp, and prompt used
   - Users can go back and try different branches
   - Completed slots show preview text and are immediately playable

---

## Development Progress

### UI Implementation (2025-10-18)

#### Countdown Animation
- Created `YearCountdown` component with smooth animations
- Counts down from 2025 → 2009 with ease-in-out timing
- Independent scaling animation (0.1 → 1.0 scale)
- Explosion effect at 2009 with fade-out
- Fixed SSR hydration issue by moving `Date.now()` to useEffect

#### Video Integration
- Intro video (`/public/intro/intro.mp4`) preloads on mount
- Fades in as countdown explodes (1s transition)
- Holds on last frame when complete
- Triggers modal popup when video ends

#### Choice Modal
- "What happens next?" popup with video game aesthetic
- Three slots (A, B, C) displayed as horizontal full-width boxes
- Glassmorphism design with blur effects
- Fly-in animation with bounce easing
- Hover effects and responsive design
- Source Code Pro typography throughout

#### About Modal
- Narrative framing: Bitcoin didn't turn out as hoped, travel back to 2009 to generate new timelines
- How It Works section explains the flow including generation time (1 hour) and refund policy (50%)
- "We inject your ideas into the story arc" replaces traditional prompt submission language
- Game Mechanics section with visual revenue sharing model:
  - 0.007 ETH per scene
  - 20% back from direct children, 10% from grandchildren, 5% from great-grandchildren
  - Visual tree diagram showing revenue flow
  - Break-even calculation displayed
- Your Creations section emphasizes permanence and discovery by other players
- Drag-to-dismiss functionality for mobile UX

#### Wallet Address Styling
- OnchainKit wallet address customized via CSS in `app/globals.css`
- Targets elements using `data-testid` attributes from OnchainKit components
- Customizations applied:
  - **Font**: Source Code Pro (matching game aesthetic)
  - **Size**: Reduced to 0.75rem (12px) for compact display
  - **Avatar**: Shrunk to 1.25rem (20px) from default 40px
  - **Background**: 30% white (`rgba(255, 255, 255, 0.3)`) with subtle hover states
  - **Padding**: Tightened to 0.5rem 0.75rem for minimal footprint
- Method: Use browser DevTools → Inspect element → Find `data-testid` attributes → Target in CSS with `[data-testid="..."]` selectors

### Infrastructure Setup (2025-10-18)

#### Video Storage
- Using **Cloudflare R2** (S3-compatible API)
- Credentials configured in `.env.local`:
  - `AWS_REGION=auto`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `AWS_S3_BUCKET_NAME=scenes`
- AWS SDK (`@aws-sdk/client-s3`) for R2 interactions

#### Database
- PostgreSQL via Neon
- See `schema.md` for full three-tier schema
- Three core tables:
  - `scenes` - Slot tree structure with atomic lock via UNIQUE constraint
  - `scene_generation_attempts` - Each paid user session (1 hour window)
  - `prompts` - Individual prompt submissions with GPT-4o-mini refinements
- Migration system: `POSTGRES_URL=xxx npm run db:migrate`
- Current migrations:
  - `001_initial_schema.sql` - Legacy two-tier structure
  - `002_refactor_to_three_tier_architecture.sql` - New three-tier architecture

#### Typography
- Using Source Code Pro font via Next.js Google Fonts integration
- Font available as CSS variable: `--font-source-code-pro`
- Configured in `app/layout.tsx` alongside existing Inter and Saira fonts

#### Development Environment
- Dev server running on http://localhost:3001
- Environment variables configured in `.env.local`
- Base mini app integration via OnchainKit

### Styling & Theming

#### Tailwind CSS 4
- Uses **Tailwind CSS v4.1.15** via `@tailwindcss/postcss` package
- Configuration is CSS-based (in `app/globals.css`), no JavaScript config file
- All styles use Tailwind utility classes

**PostCSS Configuration** (`postcss.config.js`):
```js
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {}
  },
};
```

**Theme Configuration** (`app/globals.css`):
- Import: `@import "tailwindcss"`
- `@theme` block defines custom colors, animations, and fonts
- Custom animations: `animate-fade-in`, `animate-slide-up`, `animate-slide-down`, `animate-fly-in`, `animate-border-pulse`, `animate-shimmer`, `animate-label-glow`, `animate-radiate-glow`, `animate-bounce`, `animate-spin`, `animate-checkmark-circle`, `animate-checkmark-stem`, `animate-checkmark-kick`

#### Per-Movie Color Theming

Each movie can have its own color scheme stored in the database and applied dynamically without rebuilding CSS.

**How It Works:**
```
Database (color_scheme JSONB) → MovieThemeProvider → CSS Variables → Tailwind Classes
```

**Core Files:**

1. **`app/types/movie.ts`**
   - `MovieColorScheme` interface: 7 color properties (primary, secondary, accent, bg, bgOverlay, text, textMuted)
   - `PRESET_COLOR_SCHEMES`: 5 built-in themes (2009, cyberpunk, noir, nature, horror)
   - `colorSchemeToCSS()`: Converts color scheme object to CSS variables

2. **`app/components/MovieThemeProvider.tsx`**
   - Wraps movie content and injects theme via CSS variables
   - Pass `colorScheme` prop from database

3. **`app/globals.css`**
   - `@theme` block maps `--movie-*` variables to Tailwind utilities
   - Enables classes: `bg-movie-primary`, `text-movie-text`, `border-movie-accent`, etc.

4. **Database: `movies` table**
   - `color_scheme JSONB` column stores themes as JSON
   - Example: `{"primary": "#FFD700", "secondary": "#FFA500", ...}`

5. **`app/test-theme/page.tsx`**
   - Visit `/test-theme` to preview all color schemes live

**Usage:**
```tsx
// Wrap movie content with theme provider
<MovieThemeProvider colorScheme={movie.color_scheme}>
  <WatchMovie sceneId={sceneId} />
</MovieThemeProvider>

// Use theme colors in components
<div className="bg-movie-bg text-movie-text">
  <h1 className="text-movie-primary">Title</h1>
  <button className="bg-movie-primary hover:bg-movie-secondary">Click</button>
</div>
```

**Adding New Theme Colors:**
1. Update `MovieColorScheme` interface in `app/types/movie.ts`
2. Add to `colorSchemeToCSS()` function (maps to CSS variable)
3. Add to `@theme` block in `app/globals.css` (maps to Tailwind utility)
4. Update preset themes in `PRESET_COLOR_SCHEMES`

**Adding New Animations:**
1. Add to `@theme` block: `--animate-custom: custom 2s ease-in-out`
2. Define keyframes in `app/globals.css`: `@keyframes custom { ... }`
3. Use with Tailwind: `className="animate-custom"`