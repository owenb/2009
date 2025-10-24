# Genesis Video Seeding Guide

How to manually seed your testnet with pre-generated videos for the 2009 and Mochi movies.

---

## Prerequisites

1. **Video Files Ready**
   - Genesis scene for 2009 movie
   - Genesis scene for Mochi movie
   - (Optional) Additional branching scenes

2. **Environment Setup**
   - `.env.local` configured with:
     - R2 credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, etc.)
     - Database URL (`POSTGRES_URL`)
     - (Optional) Private key for contract seeding

3. **Movies Created in Database**
   - Run migrations if not done: `npm run db:migrate`
   - Verify movies exist:
     ```bash
     PGPASSWORD="..." psql "..." -c "SELECT id, slug, name FROM movies;"
     ```

---

## Step 1: Prepare Your Video Files

Create a directory for seed videos:

```bash
mkdir -p seed-videos
```

Place your video files:

```
seed-videos/
├── 2009-genesis.mp4      # Genesis scene for 2009
├── 2009-scene-1.mp4      # First branch (optional)
├── mochi-genesis.mp4     # Genesis scene for Mochi
└── mochi-scene-1.mp4     # First branch (optional)
```

**Video Requirements:**
- Format: MP4 (H.264)
- Aspect Ratio: 9:16 (portrait, 720x1280)
- Duration: ~8 seconds (or whatever length you want)

---

## Step 2: Configure the Seeding Script

Edit `scripts/seed-genesis-videos.ts`:

```typescript
const SEED_VIDEOS: SeedVideo[] = [
  {
    movieSlug: '2009',
    sceneId: 0,                    // Genesis scenes use ID 0
    parentId: null,                // Genesis has no parent
    slot: null,                    // Genesis has no slot
    slotLabel: 'Genesis Scene',
    videoPath: './seed-videos/2009-genesis.mp4',
    creatorAddress: '0xYourWalletAddress',  // ← UPDATE THIS
    metadataURI: 'ipfs://...'      // Optional - can add later
  },

  // Add your Mochi genesis:
  {
    movieSlug: 'mochi',
    sceneId: 100,                  // Use different ID range for mochi
    parentId: null,
    slot: null,
    slotLabel: 'Mochi Genesis',
    videoPath: './seed-videos/mochi-genesis.mp4',
    creatorAddress: '0xYourWalletAddress',  // ← UPDATE THIS
  },

  // Optional: Add branching scenes
  {
    movieSlug: '2009',
    sceneId: 1,
    parentId: 0,                   // Child of genesis (sceneId 0)
    slot: 'A',                     // Slot A, B, or C
    slotLabel: 'The First Decision',
    videoPath: './seed-videos/2009-scene-1.mp4',
    creatorAddress: '0xYourWalletAddress',
  },
];
```

---

## Step 3: Run the Seeding Script

```bash
npx tsx scripts/seed-genesis-videos.ts
```

**Expected Output:**

```
🌱 Starting Genesis Video Seeding...

Total videos to seed: 2

🎬 Seeding: 2009 - Genesis Scene (Scene 0)
  ✓ Video file loaded: 12.45 MB
  ⬆️  Uploading to R2: 2009/0.mp4
  ✓ R2 upload complete: https://...
  📝 Creating database entry...
  ✅ Scene 0 seeded successfully!

🎬 Seeding: mochi - Mochi Genesis (Scene 100)
  ✓ Video file loaded: 8.23 MB
  ⬆️  Uploading to R2: mochi/100.mp4
  ✓ R2 upload complete: https://...
  📝 Creating database entry...
  ✅ Scene 100 seeded successfully!

✅ Seeding complete!
```

---

## Step 4: Verify the Seeding

### 4.1 Check Database

```bash
PGPASSWORD="npg_2ZaLCU4SqFfE" psql "postgresql://..." -c "
  SELECT s.id, m.slug, s.slot_label, s.status
  FROM scenes s
  JOIN movies m ON s.movie_id = m.id
  ORDER BY s.id;
"
```

Expected:
```
 id  | slug  | slot_label     | status
-----+-------+----------------+-----------
  0  | 2009  | Genesis Scene  | completed
  1  | 2009  | Branch A       | completed
 100 | mochi | Mochi Genesis  | completed
```

### 4.2 Check R2 Storage

Visit your R2 bucket or use CLI:

```bash
# List videos
aws s3 ls s3://scenes/2009/ --endpoint-url=https://...
aws s3 ls s3://scenes/mochi/ --endpoint-url=https://...
```

Should see:
```
2009/0.mp4
2009/1.mp4
mochi/100.mp4
```

### 4.3 Test Playback

Visit in browser:
- http://localhost:3001/movie/2009/scene/0
- http://localhost:3001/movie/mochi/scene/100

---

## Step 5: (Optional) Sync with Smart Contract

If you want full testnet realism with on-chain state:

### 5.1 Add Private Key to .env.local

```bash
PRIVATE_KEY=0xyour_testnet_private_key_here
```

### 5.2 Make Script Executable

```bash
chmod +x scripts/seed-contract-scenes.sh
```

### 5.3 Run Contract Seeding

```bash
./scripts/seed-contract-scenes.sh
```

**What it does:**
- Calls `createGenesisScene()` on your deployed contract
- Creates scene #0 for 2009 movie
- Creates genesis for Mochi movie
- Links on-chain sceneId to your database entries

**Note:** This requires:
- Contract deployed to Base Sepolia
- `cast` CLI installed (from Foundry)
- Testnet ETH in your wallet

---

## Troubleshooting

### Video File Not Found

```
❌ Video file not found: ./seed-videos/2009-genesis.mp4
```

**Fix:** Check file path is relative to project root, not script location.

### Movie Not Found

```
❌ Movie not found: 2009
```

**Fix:** Ensure movies exist in database:

```bash
PGPASSWORD="..." psql "..." -c "SELECT * FROM movies;"
```

If missing, insert manually:

```sql
INSERT INTO movies (id, slug, name, description, color_scheme)
VALUES
  (1, '2009', '2009: Bitcoin Genesis', 'The origin story', '{"primary":"#FFD700",...}'),
  (2, 'mochi', 'Mochi''s Adventure', 'A cat''s journey', '{"primary":"#FF6B9D",...}');
```

### Scene ID Already Exists

```
⚠️ Scene 0 already exists. Updating...
```

**Fix:** Script will update existing scene. If you want fresh start:

```sql
DELETE FROM scenes WHERE id IN (0, 1, 100);
```

### R2 Upload Failed

```
❌ Failed to upload to R2
```

**Fix:** Check R2 credentials in `.env.local`:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_ENDPOINT`
- `AWS_S3_BUCKET_NAME`

---

## Advanced: Batch Seeding Many Scenes

If you have many pre-generated scenes:

```typescript
// Generate scene IDs programmatically
const SEED_VIDEOS: SeedVideo[] = [
  // 2009 Genesis
  { movieSlug: '2009', sceneId: 0, parentId: null, slot: null, ... },

  // 2009 Level 1 (branches from genesis)
  ...['A', 'B', 'C'].map((slot, i) => ({
    movieSlug: '2009',
    sceneId: i + 1,
    parentId: 0,
    slot,
    slotLabel: `Branch ${slot}`,
    videoPath: `./seed-videos/2009-branch-${slot.toLowerCase()}.mp4`,
    creatorAddress: '0x...',
  })),

  // 2009 Level 2 (branches from scene 1)
  ...['A', 'B', 'C'].map((slot, i) => ({
    movieSlug: '2009',
    sceneId: i + 4,
    parentId: 1,
    slot,
    slotLabel: `Scene 1 → ${slot}`,
    videoPath: `./seed-videos/2009-scene-1-${slot.toLowerCase()}.mp4`,
    creatorAddress: '0x...',
  })),
];
```

---

## Next Steps After Seeding

1. **Test Navigation**
   - Visit `/movie/2009`
   - Click genesis scene
   - Verify branching works

2. **Test Slot System**
   - Try claiming an available slot
   - Verify payment flow works
   - Check that seeded scenes show as completed

3. **Upload NFT Metadata** (if needed)
   - Use Pinata to upload metadata JSON
   - Update scenes with `metadata_uri`:
     ```sql
     UPDATE scenes SET metadata_uri = 'ipfs://QmXXX' WHERE id = 0;
     ```

4. **Share with Team**
   - Your testnet now has explorable content
   - Team can test the full user experience

---

## Summary

**Quick Start:**

```bash
# 1. Prepare videos
mkdir seed-videos
# (Copy your video files here)

# 2. Update script with your wallet address
nano scripts/seed-genesis-videos.ts

# 3. Run seeding
npx tsx scripts/seed-genesis-videos.ts

# 4. Verify
open http://localhost:3001/movie/2009/scene/0
```

**You're Done!** Your testnet now has genesis scenes ready for exploration. 🎉
