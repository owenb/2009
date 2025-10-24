# R2 Bucket Layout

**Last Updated:** 2025-10-24
**Status:** Active Standard

This document defines the official R2 storage structure for the movie platform.

---

## Overview

The platform uses two Cloudflare R2 buckets:

1. **`scenes`** (Private) - User-generated scene videos, access via signed URLs
2. **`public-images`** (Public) - Movie metadata assets, publicly accessible

Scene IDs are **globally unique** across all movies, assigned by PostgreSQL SERIAL sequence.

---

## Private Bucket: `scenes`

### Purpose
Stores all user-generated scene videos. Access requires signed URLs to enforce payment verification.

### Structure

```
scenes/
  {movie_slug}/
    {global_scene_id}.mp4
```

**Path Components:**
- `{movie_slug}` - Movie's URL-safe identifier (e.g., `2009`, `mochi`, `cyberpunk-2077`)
- `{global_scene_id}` - Scene's unique ID from database (globally unique integer)

### Examples

```
scenes/
  2009/
    0.mp4          # Genesis scene for "2009" movie (scene ID 0)
    1.mp4          # Extension A of genesis (scene ID 1)
    2.mp4          # Extension B of genesis (scene ID 2)
    8.mp4          # Extension C of genesis (scene ID 8)
    4.mp4          # Child of scene 2 (scene ID 4)
    17.mp4         # Some later scene in tree (scene ID 17)

  mochi/
    18.mp4         # Genesis scene for "mochi" movie (scene ID 18)
    19.mp4         # Extension A of mochi genesis (scene ID 19)
    20.mp4         # Extension B of mochi genesis (scene ID 20)
    21.mp4         # Extension C of mochi genesis (scene ID 21)

  cyberpunk-2077/
    52.mp4         # Genesis for third movie (scene ID 52)
    53.mp4         # Extension A (scene ID 53)
    54.mp4         # Extension B (scene ID 54)
```

### Key Properties

- **Global Scene IDs**: IDs increment continuously across all movies (no per-movie reset)
- **No Special Genesis Naming**: Genesis scenes use their actual scene ID (no `INTRO.mp4` or special cases)
- **Movie Grouping**: Files organized by movie slug for human readability and maintenance
- **Gaps in Numbering**: Scene IDs may have gaps within a movie (e.g., 0, 1, 2, 8, 17) - this is normal

### Why Global IDs?

**Benefits:**
1. **Database simplicity** - Single `id SERIAL` primary key, clean foreign keys
2. **Smart contract efficiency** - 47% less gas than composite keys
3. **Performance** - Single-column lookups, no hashing required
4. **Already implemented** - Current schema uses global IDs

**Trade-offs:**
- Scene numbers not sequential per movie (acceptable - users never see IDs)
- Must validate parent is in same movie (simple application-level check)

### Access Pattern

Videos are accessed via signed URLs with 1-hour expiration:

```typescript
import { getSignedVideoUrl } from '@/lib/r2';

// Generate signed URL for playback
const videoUrl = await getSignedVideoUrl(sceneId);
// Returns: https://{endpoint}/scenes/2009/17.mp4?X-Amz-Algorithm=...
```

---

## Public Bucket: `public-images`

### Purpose
Stores publicly accessible assets that don't require authentication (movie cover images, platform UI assets).

### Structure

```
public-images/
  movies/
    {movie_slug}/
      cover.jpg
      thumbnail.jpg
      hero.jpg

  ui/
    logo.png
    favicon.ico
    default-cover.jpg
```

### Examples

```
public-images/
  movies/
    2009/
      cover.jpg        # Full-size cover image for movie browser (1200x630)
      thumbnail.jpg    # Smaller thumbnail for lists (400x300)
      hero.jpg         # Hero image for movie detail page (1920x1080)

    mochi/
      cover.jpg
      thumbnail.jpg
      hero.jpg

    cyberpunk-2077/
      cover.jpg
      thumbnail.jpg
      hero.jpg

  ui/
    logo.png           # Platform logo
    favicon.ico        # Browser favicon
    default-cover.jpg  # Fallback for movies without custom cover
```

### Image Specifications

**Cover Image (`cover.jpg`):**
- Dimensions: 1200x630px (Open Graph standard)
- Format: JPEG, quality 85%
- Use: Movie browser, social sharing

**Thumbnail (`thumbnail.jpg`):**
- Dimensions: 400x300px
- Format: JPEG, quality 80%
- Use: Movie list cards, compact views

**Hero Image (`hero.jpg`):**
- Dimensions: 1920x1080px
- Format: JPEG, quality 90%
- Use: Movie detail page header

### Access Pattern

Public URLs accessed directly without signing:

```typescript
// Public URL (set via R2 custom domain or public endpoint)
const coverUrl = `https://pub-xxxxx.r2.dev/movies/2009/cover.jpg`;

// Or via helper function
import { getMovieCoverUrl } from '@/lib/r2';
const coverUrl = getMovieCoverUrl('2009', 'cover');
```

---

## Migration from Old Structure

### Old Structure (Before 2025-10-24)

```
scenes/
  INTRO.mp4    # Special case for genesis
  1.mp4        # Flat structure
  2.mp4
  4.mp4
  6.mp4
  8.mp4
```

**Problems:**
- `INTRO.mp4` special case (not using scene ID)
- No movie organization (all files in root)
- Will not scale with multiple movies

### New Structure (Current)

```
scenes/
  2009/
    0.mp4      # Was INTRO.mp4 (genesis scene, scene_id = 0)
    1.mp4      # Was 1.mp4
    2.mp4      # Was 2.mp4
    4.mp4      # Was 4.mp4
    6.mp4      # Was 6.mp4
    8.mp4      # Was 8.mp4
```

### Migration Mapping

| Old Path | New Path | Scene ID | Notes |
|----------|----------|----------|-------|
| `INTRO.mp4` | `2009/0.mp4` | 0 | Genesis scene for "2009" movie |
| `1.mp4` | `2009/1.mp4` | 1 | Extension A of genesis |
| `2.mp4` | `2009/2.mp4` | 2 | Extension B of genesis |
| `4.mp4` | `2009/4.mp4` | 4 | Child scene |
| `6.mp4` | `2009/6.mp4` | 6 | Child scene |
| `8.mp4` | `2009/8.mp4` | 8 | Extension C of genesis |

### Migration Script

Located at: `scripts/migrate-r2-structure.ts`

The script will:
1. Query database to get all scenes with their movie slugs
2. Copy each video from old path to new path
3. Verify copy succeeded (check file size matches)
4. Delete old file only after successful verification
5. Log all operations for audit trail

**Safety:**
- Non-destructive: Copies files before deleting originals
- Idempotent: Can be run multiple times safely
- Rollback: Can restore from old files if needed

---

## Code Implications

### Database Queries

All scene queries must join to movies table to get slug:

```sql
-- Get scene with movie context
SELECT s.id, s.slot_label, m.slug as movie_slug
FROM scenes s
JOIN movies m ON s.movie_id = m.id
WHERE s.id = $1;
```

### R2 Helper Functions

Updated functions in `lib/r2.ts`:

```typescript
/**
 * Get video key (R2 path) for a scene
 * Requires database lookup to get movie slug
 */
export async function getVideoKey(sceneId: number): Promise<string> {
  const scene = await db.query(
    'SELECT m.slug FROM scenes s JOIN movies m ON s.movie_id = m.id WHERE s.id = $1',
    [sceneId]
  );
  return `${scene.slug}/${sceneId}.mp4`;
}

/**
 * Upload scene video to R2
 */
export async function uploadSceneVideo(
  sceneId: number,
  movieSlug: string,
  videoBlob: Blob
): Promise<string> {
  const key = `${movieSlug}/${sceneId}.mp4`;
  // ... upload logic
}

/**
 * Get signed URL for scene video
 */
export async function getSignedVideoUrl(
  sceneId: number,
  expiresIn: number = 3600
): Promise<string> {
  const key = await getVideoKey(sceneId);
  // ... generate signed URL
}

/**
 * Get public movie cover image URL
 */
export function getMovieCoverUrl(
  movieSlug: string,
  type: 'cover' | 'thumbnail' | 'hero' = 'cover'
): string {
  return `${PUBLIC_IMAGES_URL}/movies/${movieSlug}/${type}.jpg`;
}
```

### API Endpoints

All video-serving endpoints must include movie context:

```typescript
// app/api/scenes/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const sceneId = parseInt(params.id);

  // Query includes movie join
  const scene = await db.query(
    `SELECT s.*, m.slug as movie_slug
     FROM scenes s
     JOIN movies m ON s.movie_id = m.id
     WHERE s.id = $1`,
    [sceneId]
  );

  // Generate signed URL with movie context
  const videoUrl = await getSignedVideoUrl(sceneId);

  return Response.json({ scene, videoUrl });
}
```

### Frontend Components

No changes required - components already use scene IDs, movie context is fetched from API.

---

## Validation Rules

### Cross-Movie Parent Prevention

Since scene IDs are global, must validate parent is in same movie:

```typescript
// Before creating scene, validate parent
async function validateSceneCreation(
  movieId: number,
  parentId: number | null
): Promise<void> {
  if (parentId === null) {
    return; // Genesis scene, no parent
  }

  const parent = await db.query(
    'SELECT movie_id FROM scenes WHERE id = $1',
    [parentId]
  );

  if (parent.movie_id !== movieId) {
    throw new Error('Parent scene must be in the same movie');
  }
}
```

This validation happens in:
- Backend API (slot lock acquisition)
- Frontend (should never send invalid parent, but backend validates)
- Smart contract (optional - can validate movieId matches parent's movieId)

---

## Smart Contract Considerations

### Scene ID Assignment

**Database generates scene IDs** (via PostgreSQL SERIAL), contract validates slot ownership:

```solidity
// Contract tracks slot ownership (not scene IDs)
mapping(bytes32 => address) public slotOwner;  // hash(parentId, slot) => owner

function purchaseSlot(uint256 parentId, uint8 slot) external payable {
    bytes32 slotKey = keccak256(abi.encodePacked(parentId, slot));
    require(slotOwner[slotKey] == address(0), "Slot taken");

    slotOwner[slotKey] = msg.sender;

    // Distribute revenue to ancestors
    distributeRevenue(parentId);

    emit SlotPurchased(parentId, slot, msg.sender);
}
```

Backend workflow:
1. User requests slot → Backend creates scene row → Gets scene ID from SERIAL
2. User pays → Contract validates slot available → Records payment
3. Backend verifies tx → Marks scene as paid
4. Video generates → Uploads to R2 at `{movie_slug}/{scene_id}.mp4`

### Revenue Distribution

Contract uses global scene IDs for ancestor lookups:

```solidity
mapping(uint256 => Scene) public scenes;  // sceneId => Scene

struct Scene {
    address creator;
    uint256 parentId;  // Global parent scene ID
    uint256 movieId;   // For movie creator revenue
}

function distributeRevenue(uint256 parentId) internal {
    // Parent: 20%
    Scene memory parent = scenes[parentId];
    payable(parent.creator).transfer(parentShare);

    // Grandparent: 10%
    Scene memory grandparent = scenes[parent.parentId];
    payable(grandparent.creator).transfer(grandparentShare);

    // Great-grandparent: 5%
    Scene memory greatGrandparent = scenes[grandparent.parentId];
    payable(greatGrandparent.creator).transfer(greatGrandparentShare);

    // Movie creator: remainder (~55%)
    // Platform: remainder (~10%)
}
```

**Gas efficiency:** Global IDs require no hashing, just direct mapping lookups (~2.1k gas each).

---

## Future Considerations

### Per-Movie CDN Optimization

Movie-specific folders enable future optimizations:

```
# Different caching rules per movie
scenes/2009/*           -> Cache-Control: public, max-age=31536000
scenes/archived-movie/* -> Glacier storage class
```

### Analytics

Easy to analyze per-movie storage:

```bash
# Total videos per movie
wrangler r2 object list scenes --prefix "2009/" | wc -l

# Storage used per movie
wrangler r2 object list scenes --prefix "mochi/" --json | jq '[.[] | .size] | add'
```

### Movie Archival

Can archive entire movie by moving folder:

```typescript
// Move all scenes to archive bucket
await moveR2Prefix('scenes/old-movie/', 'archive/old-movie/');
```

### Custom Domains per Movie

Could map custom domains to specific movie folders:

```
2009.yourdomain.com    -> scenes/2009/*
mochi.yourdomain.com   -> scenes/mochi/*
```

---

## Environment Variables

Required in `.env.local`:

```bash
# Private scenes bucket
AWS_S3_ENDPOINT=https://{account-id}.r2.cloudflarestorage.com
AWS_REGION=auto
AWS_ACCESS_KEY_ID=xxxxx
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_S3_BUCKET_NAME=scenes

# Public images bucket
PUBLIC_IMAGES_BUCKET_NAME=public-images
PUBLIC_IMAGES_URL=https://pub-xxxxx.r2.dev

# Cloudflare credentials (for wrangler CLI)
CLOUDFLARE_ACCOUNT_ID=xxxxx
CLOUDFLARE_API_TOKEN=xxxxx
```

---

## Operations

### Uploading a New Scene Video

```typescript
import { uploadSceneVideo } from '@/lib/r2';

// After video generation completes
const sceneId = 25;
const movieSlug = '2009';
const videoBlob = await fetchGeneratedVideo(jobId);

const publicUrl = await uploadSceneVideo(sceneId, movieSlug, videoBlob);
// Uploads to: scenes/2009/25.mp4
// Returns: https://{endpoint}/scenes/2009/25.mp4
```

### Uploading Movie Cover Images

```typescript
import { uploadMovieCover } from '@/lib/r2';

const movieSlug = 'cyberpunk-2077';
const coverBlob = await fetch('/path/to/cover.jpg').then(r => r.blob());

await uploadMovieCover(movieSlug, coverBlob, 'cover');
// Uploads to: public-images/movies/cyberpunk-2077/cover.jpg

await uploadMovieCover(movieSlug, thumbnailBlob, 'thumbnail');
// Uploads to: public-images/movies/cyberpunk-2077/thumbnail.jpg
```

### Accessing Videos (Frontend)

```typescript
// In React component
const { data } = await fetch(`/api/scenes/${sceneId}`);
const { videoUrl } = data;

// videoUrl is signed, expires in 1 hour
<video src={videoUrl} controls />
```

### Accessing Public Images

```typescript
import { getMovieCoverUrl } from '@/lib/r2';

const coverUrl = getMovieCoverUrl('2009', 'cover');
// Returns: https://pub-xxxxx.r2.dev/movies/2009/cover.jpg

<img src={coverUrl} alt="Movie cover" />
```

---

## Debugging

### Finding a Scene's Video

Given scene ID 17:

1. **Query database:**
   ```sql
   SELECT s.id, m.slug, s.status, s.slot_label
   FROM scenes s
   JOIN movies m ON s.movie_id = m.id
   WHERE s.id = 17;
   ```
   Returns: `{ id: 17, slug: '2009', status: 'completed', slot_label: 'some scene' }`

2. **Construct R2 path:**
   ```
   scenes/2009/17.mp4
   ```

3. **Check if exists:**
   ```bash
   # Using wrangler CLI
   npx wrangler r2 object get scenes/2009/17.mp4 --file /tmp/test.mp4

   # Using script
   npx tsx scripts/check-video-exists.ts 17
   ```

### Common Issues

**Video not found:**
- Check scene status is `completed` (not `generating`, `failed`, etc.)
- Verify video was uploaded successfully (check R2 bucket directly)
- Ensure signed URL hasn't expired (1-hour TTL)

**Wrong movie folder:**
- Verify scene's `movie_id` matches expected movie
- Check migration completed for old flat-structure videos

**Cross-movie parent:**
- Check parent scene's `movie_id` matches child's `movie_id`
- Review application validation logic

---

## References

- **Schema:** `schema.md` - Database structure
- **Platform Design:** `MOVIE_PLATFORM.md` - Overall platform architecture
- **Analysis:** `CONCURRENCY_AND_CONTRACT_ANALYSIS.md` - Global vs scoped IDs analysis
- **Migration Script:** `scripts/migrate-r2-structure.ts` - One-time migration tool

---

**Questions or Issues?** Contact: [Add contact info or link to GitHub issues]
