# Database Helpers

Centralized database query functions for the movie platform. All database operations should use these helpers instead of writing raw SQL in API routes.

## Structure

```
lib/db/
├── index.ts          # Re-exports all helpers (use this for imports)
├── types.ts          # TypeScript types for all database entities
├── movies.ts         # Movie-related queries
├── scenes.ts         # Scene-related queries
└── attempts.ts       # Generation attempts & prompts queries
```

## Usage

### Import from index

```typescript
import { getMovieBySlug, getSceneById, createAttempt } from '@/lib/db';
```

Or import specific modules:

```typescript
import { getMovieBySlug } from '@/lib/db/movies';
import { getSlotsForScene } from '@/lib/db/scenes';
```

## Examples

### Movies

```typescript
// Get a movie by slug
const movie = await getMovieBySlug('2009');

// Get movie with genesis scene info
const movieWithGenesis = await getMovieWithGenesis('2009');

// Browse movies with filters
const { movies, total } = await getMovies(
  { status: 'active', genre: 'sci-fi' },
  { sortBy: 'total_views', sortOrder: 'desc', limit: 10 }
);

// Get featured movies
const featured = await getFeaturedMovies(6);

// Create a new movie
const newMovie = await createMovie({
  slug: 'winter',
  title: 'Winter Is Coming',
  description: 'A tale of ice and fire',
  creator_address: '0x...',
  status: 'draft',
});

// Update movie status
await updateMovieStatus(movieId, 'active');

// Increment scene count
await incrementMovieScenes(movieId);
```

### Scenes

```typescript
// Get a scene by ID
const scene = await getSceneById(123);

// Get scene with attempt info
const sceneWithAttempt = await getSceneWithAttempt(123);

// Get all slots for a parent scene (UI-friendly format)
const slots = await getSlotsForScene(parentId);
// Returns: [{ slot: 'A', exists: true, isLocked: false, ... }, ...]

// Get all scenes in a movie
const scenes = await getScenesByMovie(movieId, { status: 'completed' });

// Try to acquire a lock on a slot
const lockedScene = await acquireSlotLock(
  movieId,
  parentId,
  'A',
  userAddress,
  userFid,
  60 // lock duration in seconds
);

// Complete a scene
await completeScene(sceneId, creatorAddress, creatorFid, attemptId, 'Walk to the bedroom');

// Get video URL for a scene
const videoUrl = getSceneVideoUrl(sceneId);
// Returns: https://bucket.r2.cloudflarestorage.com/123.mp4
```

### Attempts & Prompts

```typescript
// Create a generation attempt (after payment verified)
const attempt = await createAttempt({
  scene_id: sceneId,
  creator_address: userAddress,
  creator_fid: userFid,
  transaction_hash: txHash,
  payment_confirmed_at: new Date(),
  retry_window_expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
});

// Get active attempts for a user
const activeAttempts = await getActiveAttemptsByUser(userAddress);

// Create a prompt submission
const prompt = await createPrompt({
  attempt_id: attemptId,
  prompt_text: 'User types: The protagonist walks to the bedroom',
  refined_prompt_text: 'GPT-4o-mini refined: A young person walks slowly to a dimly lit bedroom',
});

// Start video generation
await startPromptGeneration(promptId, videoJobId);

// Update polling timestamp
await updatePromptPoll(promptId);

// Complete the prompt
await completePrompt(promptId);

// Or handle failures
await rejectPrompt(promptId, 'Content policy violation');
await failPrompt(promptId, 'API timeout');

// Get all generating prompts (for background job)
const generatingPrompts = await getGeneratingPrompts();
```

## Types

All types are defined in `types.ts` and exported via the index:

```typescript
import type { Movie, Scene, SlotInfo, SceneGenerationAttempt, Prompt } from '@/lib/db';
```

### Key Types

- **Movie**: Full movie record from database
- **MovieWithGenesis**: Movie + genesis video URL
- **Scene**: Full scene record
- **SceneWithAttempt**: Scene + active attempt/prompt info
- **SlotInfo**: UI-friendly slot representation (used in modal)
- **SceneGenerationAttempt**: Payment-verified generation attempt
- **Prompt**: Individual prompt submission within an attempt

### Status Enums

- **SceneStatus**: `'locked' | 'verifying_payment' | 'awaiting_prompt' | 'generating' | 'completed' | 'failed' | 'lock_expired'`
- **AttemptOutcome**: `'in_progress' | 'succeeded' | 'failed' | 'abandoned'`
- **PromptOutcome**: `'pending' | 'generating' | 'success' | 'moderation_rejected' | 'rate_limited' | 'api_error' | 'timeout' | 'abandoned'`

## Benefits

### Before (Raw SQL in routes)

```typescript
// app/api/scenes/[sceneId]/route.ts
const result = await query<SceneRow>(
  `SELECT s.id, s.parent_id, s.slot, s.slot_label, s.status, ...
   FROM scenes s WHERE s.id = $1 AND s.status = 'completed' LIMIT 1`,
  [sceneId]
);
const scene = result.rows[0];
const videoUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.r2.cloudflarestorage.com/${scene.id}.mp4`;
```

### After (Using helpers)

```typescript
// app/api/scenes/[sceneId]/route.ts
const scene = await getSceneById(sceneId);
const videoUrl = getSceneVideoUrl(scene.id);
```

### Advantages

✅ **Less code** - 2 lines instead of 10+
✅ **Type safety** - TypeScript types ensure correctness
✅ **Reusability** - Same logic used across multiple routes
✅ **Maintainability** - Change schema once, not in 20 files
✅ **Consistency** - Same query returns same shape
✅ **Testability** - Easy to mock helpers in tests

## Migration Guide

When updating existing API routes:

1. **Import the helper**:
   ```typescript
   import { getSceneById } from '@/lib/db/scenes';
   ```

2. **Replace raw query**:
   ```typescript
   // Before
   const result = await query<Scene>(`SELECT * FROM scenes WHERE id = $1`, [id]);
   const scene = result.rows[0];

   // After
   const scene = await getSceneById(id);
   ```

3. **Use typed responses**:
   ```typescript
   // Types are automatically inferred
   if (scene.status === 'completed') { // ✅ Type-safe
     // ...
   }
   ```

## Adding New Helpers

When adding new database operations:

1. **Define types** in `types.ts` if needed
2. **Add function** to appropriate module (`movies.ts`, `scenes.ts`, etc.)
3. **Document** with JSDoc comments
4. **Export** via `index.ts` (already done via wildcard exports)

Example:

```typescript
// lib/db/movies.ts

/**
 * Get the most popular movies by view count
 * @param limit - Number of movies to return
 */
export async function getPopularMovies(limit: number = 10): Promise<Movie[]> {
  const result = await query<Movie>(
    `SELECT * FROM movies
     WHERE status = 'active'
     ORDER BY total_views DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}
```

Then use it:

```typescript
import { getPopularMovies } from '@/lib/db';
const popular = await getPopularMovies(5);
```

## Notes

- All helpers use the base `query()` function from `lib/db.ts`
- Connection pooling is handled automatically
- Helpers are framework-agnostic (not Next.js-specific)
- Can be used in API routes, server components, middleware, etc.
- Always prefer helpers over raw SQL for consistency
