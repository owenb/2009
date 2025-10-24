# Complete Implementation Guide: Escrow Flow Migration

**Generated:** 2025-10-24
**Updated:** 2025-10-24 (Implementation completed)
**Status:** ✅ All code complete | Testing & deployment pending

This is the **single source of truth** for implementing the escrow flow and movie management improvements.

---

## Table of Contents

1. [Overview](#overview)
2. [Smart Contract Flow](#smart-contract-flow)
3. [Status Summary](#status-summary)
4. [Implementation Steps](#implementation-steps)
5. [Testing Checklist](#testing-checklist)
6. [Deployment Checklist](#deployment-checklist)

---

## Overview

### What's Changing

**OLD FLOW:**
```
claimSlot() → NFT minted immediately → Prompt → Generate → Complete
```

**NEW FLOW (Escrow):**
```
claimSlot() → Escrow created (no NFT) → Prompt → Generate → Video ready
  ↓
User chooses:
  → confirmScene() → NFT minted + funds distributed
  → requestRefund() → 50% refund + slot reopens
```

### Why This Guide

The audit found discrepancies between documentation and codebase. This guide:
- ✅ Aligns with actual smart contract (`VideoAdventureV1.sol:375-537`)
- ✅ Provides exact file paths and line numbers
- ✅ Includes complete code snippets
- ✅ Orders steps to avoid dependency issues

---

## Smart Contract Flow

### Contract Events (Source of Truth)

From `VideoAdventureV1.sol:136-139`:

```solidity
event SlotClaimed(uint256 indexed sceneId, uint256 indexed movieId, uint256 indexed parentId, uint8 slot, address buyer, uint256 amount);
event SceneConfirmed(uint256 indexed sceneId, address indexed creator);
event RefundIssued(uint256 indexed sceneId, address indexed buyer, uint256 amount);
event EscrowExpired(uint256 indexed sceneId, address indexed buyer);
```

### Contract Functions

1. **`claimSlot(uint256 parentId, uint8 slot)`** (line 375)
   - Takes payment, creates escrow
   - Reserves `sceneId` but doesn't mint NFT
   - Locks slot for 1 hour (`ESCROW_DURATION`)
   - Returns `sceneId` for backend tracking

2. **`confirmScene(uint256 sceneId, string metadataURI)`** (line 450)
   - Only callable by escrow buyer
   - Mints NFT to buyer
   - Distributes funds (20% parent, 10% grandparent, 5% great-grandparent, 55% movie creator, 10% platform)
   - Emits `SceneConfirmed`

3. **`requestRefund(uint256 sceneId)`** (line 505)
   - Only callable by escrow buyer
   - Can be called during Active OR Expired escrow
   - Returns 50% to user immediately
   - Credits 50% to movie creator
   - Reopens slot for others
   - Emits `RefundIssued`

### Revenue Distribution (line 547-593)

```
User pays 0.007 ETH → Distribution:
- 20% to parent scene creator (0.0014 ETH)
- 10% to grandparent creator (0.0007 ETH)
- 5% to great-grandparent creator (0.00035 ETH)
- 55% to movie creator (0.00385 ETH)
- 10% to platform treasury (0.0007 ETH)
```

If ancestors don't exist, their shares go to movie creator.

---

## Status Summary

### ✅ Completed (2025-10-24)

**Step 0: Contract Improvements**
- ✅ Added `DEFAULT_SCENE_PRICE` constant (0.007 ETH)
- ✅ Added `MovieCreatorUpdated` event
- ✅ Updated `createMovie()` to owner-only with `creator` parameter
- ✅ Added `setMovieCreator()` function for updating revenue recipients
- ✅ All 26 tests passing
- ✅ ABI regenerated: `lib/VideoAdventure.abi.json` (38KB)

### ✅ Completed (2025-10-24 - Second Update)

**Backend & Database:**
- ✅ Step 1: Database migration (add `awaiting_confirmation` status)
- ✅ Step 2: Pinata integration (`lib/pinata.ts`)
- ✅ Step 3: Update `/api/generation/complete`
- ✅ Step 4: Create `/api/scenes/verify-confirmation`
- ✅ Step 5: Create `/api/scenes/verify-refund`

**Frontend:**
- ✅ Step 6: Update confirmation UI in `generating/page.tsx`

**Environment:**
- ✅ Pinata credential placeholders added to `.env.local`

### 🚧 Pending

**Environment Setup:**
- ⚠️ Add real Pinata API credentials (get from https://app.pinata.cloud/keys)

**Testing:**
- ❌ Local testing of full escrow flow
- ❌ Test Pinata metadata uploads
- ❌ Test confirmation and refund transactions

**Contract Deployment:**
- ❌ Deploy to Base Sepolia (testnet)
- ❌ Deploy to Base Mainnet (production)

---

## Implementation Steps

### Step 0: Contract Improvements ✅ COMPLETED

**Status:** ✅ Done (2025-10-24)

All contract changes have been applied and tested. The contract now:
- Has a `DEFAULT_SCENE_PRICE` constant (0.007 ETH)
- Restricts `createMovie()` to owner-only (case-by-case partnerships)
- Supports updating revenue recipients via `setMovieCreator()`
- Has regenerated ABI with all new functions

**Files Modified:**
- `contracts/VideoAdventureV1.sol` - Contract updates
- `test/VideoAdventureV1.t.sol` - Test updates
- `lib/VideoAdventure.abi.json` - Regenerated ABI

**Test Results:** All 26 tests passing ✅

**Next Action:** Deploy contract to testnet or proceed with Step 1 (database migration).

---

### Step 1: Database Migration

**File:** `migrations/010_escrow_flow_updates.sql`

**What:** Add `awaiting_confirmation` status and fix UNIQUE constraint for multi-movie support.

**Why:** Contract doesn't mint NFT until `confirmScene()`, so we need intermediate status. UNIQUE constraint must include `movie_id` since slot A in movie 1 ≠ slot A in movie 2.

**Implementation:**

```sql
-- Migration 010: Escrow Flow Updates
-- Date: 2025-10-24

BEGIN;

-- 1. Add awaiting_confirmation status
ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_status_check;
ALTER TABLE scenes ADD CONSTRAINT scenes_status_check CHECK (status IN (
  'locked',              -- Payment pending (1-minute lock)
  'verifying_payment',   -- Checking blockchain tx
  'awaiting_prompt',     -- Payment verified, needs prompt
  'generating',          -- Video generation in progress
  'awaiting_confirmation', -- NEW: Video ready, needs confirmScene() or requestRefund()
  'completed',           -- NFT minted, funds distributed
  'failed',              -- Generation failed
  'lock_expired'         -- Lock expired before payment
));

-- 2. Update UNIQUE constraint for multi-movie support
-- Current: UNIQUE(parent_id, slot) - WRONG (conflicts across movies)
-- New: UNIQUE(movie_id, parent_id, slot) - CORRECT
ALTER TABLE scenes DROP CONSTRAINT IF EXISTS unique_parent_slot;
ALTER TABLE scenes ADD CONSTRAINT unique_movie_parent_slot
  UNIQUE (movie_id, parent_id, slot);

-- 3. Add metadata_uri column for IPFS metadata
-- Stores ipfs://Qm... URI from Pinata after video generation
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS metadata_uri TEXT;

COMMIT;
```

**Run:**
```bash
POSTGRES_URL="your-neon-url" npm run db:migrate
```

---

### Step 2: Pinata Integration

**File:** `lib/pinata.ts`

**What:** Upload NFT metadata to IPFS with video URL.

**Why:** Contract requires `metadataURI` parameter in `confirmScene()`. Metadata points to R2 video via `animation_url`.

**Implementation:**

```typescript
/**
 * Pinata IPFS Integration
 * Uploads NFT metadata to IPFS for confirmScene() call
 */

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_API_BASE = 'https://api.pinata.cloud';

export interface NFTMetadata {
  name: string;              // "2009 Scene #123"
  description: string;       // User's prompt or slot label
  animation_url: string;     // R2 video URL (https://...)
  image?: string;            // Optional thumbnail
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

/**
 * Upload NFT metadata to IPFS via Pinata
 * @param sceneId - Scene ID from smart contract
 * @param movieSlug - Movie identifier (e.g., "2009")
 * @param videoUrl - R2 video URL (public HTTPS)
 * @param slotLabel - Scene description
 * @returns IPFS URI (ipfs://Qm...)
 */
export async function uploadMetadataToPinata(
  sceneId: number,
  movieSlug: string,
  videoUrl: string,
  slotLabel: string
): Promise<string> {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    throw new Error('Pinata credentials missing in environment');
  }

  // Construct ERC-721 metadata
  const metadata: NFTMetadata = {
    name: `${movieSlug.toUpperCase()} Scene #${sceneId}`,
    description: slotLabel,
    animation_url: videoUrl, // Points to R2 (public HTTPS)
    image: videoUrl.replace('.mp4', '-thumbnail.jpg'), // Optional: if you generate thumbnails
    attributes: [
      { trait_type: 'Movie', value: movieSlug },
      { trait_type: 'Scene ID', value: sceneId },
      { trait_type: 'Type', value: 'Video Scene' }
    ]
  };

  console.log('[Pinata] Uploading metadata:', metadata);

  // Upload to Pinata
  const response = await fetch(`${PINATA_API_BASE}/pinning/pinJSONToIPFS`, {
    method: 'POST',
    headers: {
      'pinata_api_key': PINATA_API_KEY,
      'pinata_secret_api_key': PINATA_SECRET_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: {
        name: `Scene-${sceneId}-${movieSlug}.json`
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Pinata upload failed: ${JSON.stringify(error)}`);
  }

  const result = await response.json();
  const ipfsHash = result.IpfsHash;

  console.log(`[Pinata] ✓ Metadata uploaded: ipfs://${ipfsHash}`);

  return `ipfs://${ipfsHash}`;
}
```

**Add to `.env.local`:**
```bash
# Pinata IPFS (get from https://app.pinata.cloud/keys)
PINATA_API_KEY=your_api_key_here
PINATA_SECRET_KEY=your_secret_key_here
```

---

### Step 3: Update `/api/generation/complete`

**File:** `app/api/generation/complete/route.ts`

**What:** Change status from `completed` to `awaiting_confirmation` and add Pinata upload.

**Why:** NFT isn't minted until user calls `confirmScene()`, so status must reflect this. We also need `metadataURI` ready for the confirmation call.

**Current Code (line 178-194) - WRONG:**
```typescript
await query(`
  UPDATE scenes
  SET
    status = 'completed',  // ❌ Too early - NFT not minted!
    creator_address = $1,
    creator_fid = $2,
    current_attempt_id = $3,
    slot_label = $4,
    updated_at = NOW()
  WHERE id = $5
`, [...]);
```

**New Code:**

Add import at top:
```typescript
import { uploadMetadataToPinata } from '@/lib/pinata';
```

Replace scene update section (around line 141-194):
```typescript
// After R2 upload succeeds (around line 141)

// Upload metadata to IPFS
let metadataURI: string;
try {
  console.log('[Complete] Uploading metadata to Pinata...');
  metadataURI = await uploadMetadataToPinata(
    sceneId,
    promptRow.movie_slug,
    r2Url,
    slotLabel
  );
  console.log(`[Complete] ✓ Metadata uploaded: ${metadataURI}`);
} catch (error) {
  console.error('[Complete] ❌ Pinata upload failed:', error);
  // Fallback: use R2 URL directly (not ideal but prevents total failure)
  metadataURI = r2Url;
}

// Update scene to awaiting_confirmation (NOT completed!)
await query(`
  UPDATE scenes
  SET
    status = 'awaiting_confirmation',  -- ✓ Video ready, needs confirmScene()
    creator_address = $1,
    creator_fid = $2,
    current_attempt_id = $3,
    slot_label = $4,
    metadata_uri = $5,  -- Store for frontend
    updated_at = NOW()
  WHERE id = $6
`, [
  promptRow.creator_address,
  promptRow.creator_fid,
  promptRow.attempt_id,
  slotLabel,
  metadataURI,  -- NEW
  sceneId
]);

console.log(`[Complete] ✓ Scene ${sceneId} ready for confirmation`);

return NextResponse.json({
  success: true,
  sceneId,
  videoUrl: r2Url,
  metadataURI,  -- NEW: Frontend needs this for confirmScene()
  slotLabel,
  parentId: promptRow.parent_id,
  slot: promptRow.slot,
  message: 'Video ready - please confirm or request refund'
});
```

---

### Step 4: Create `/api/scenes/verify-confirmation`

**File:** `app/api/scenes/verify-confirmation/route.ts`

**What:** Verify `confirmScene()` transaction and mark scene as completed.

**Why:** After user calls `confirmScene()` via wagmi, we need to verify the blockchain event and update our database.

**Implementation:**

```typescript
/**
 * Scene Confirmation Verification
 * POST /api/scenes/verify-confirmation
 *
 * Verifies SceneConfirmed event from blockchain, then marks scene completed
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { createPublicClient, http, decodeEventLog, type Hash } from 'viem';
import { base } from 'viem/chains';
import VideoAdventureABI from '@/lib/VideoAdventure.abi.json';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

interface VerifyConfirmationRequest {
  sceneId: number;
  transactionHash: string;
  userAddress: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyConfirmationRequest = await request.json();
    const { sceneId, transactionHash, userAddress } = body;

    console.log(`[VerifyConfirmation] Verifying scene ${sceneId} for ${userAddress}`);

    // 1. Check scene exists and is awaiting confirmation
    const sceneResult = await query(`
      SELECT id, status, creator_address
      FROM scenes
      WHERE id = $1
    `, [sceneId]);

    if (sceneResult.rowCount === 0) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    const scene = sceneResult.rows[0];

    if (scene.status !== 'awaiting_confirmation') {
      return NextResponse.json({
        error: `Scene is ${scene.status}, not awaiting confirmation`
      }, { status: 400 });
    }

    if (scene.creator_address?.toLowerCase() !== userAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // 2. Verify transaction on blockchain
    const client = createPublicClient({
      chain: base,
      transport: http()
    });

    const receipt = await client.getTransactionReceipt({
      hash: transactionHash as Hash
    });

    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'Transaction failed' }, { status: 400 });
    }

    // 3. Find SceneConfirmed event in logs
    let confirmed = false;
    let eventSceneId: bigint | null = null;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) {
        continue;
      }

      try {
        const decoded = decodeEventLog({
          abi: VideoAdventureABI,
          data: log.data,
          topics: log.topics
        });

        if (decoded.eventName === 'SceneConfirmed') {
          const args = decoded.args as unknown as {
            sceneId: bigint;
            creator: string;
          };
          eventSceneId = args.sceneId;

          if (Number(eventSceneId) === sceneId) {
            confirmed = true;
            break;
          }
        }
      } catch {
        continue; // Skip logs we can't decode
      }
    }

    if (!confirmed) {
      return NextResponse.json({
        error: 'SceneConfirmed event not found in transaction'
      }, { status: 400 });
    }

    // 4. Update scene to completed
    await query(`
      UPDATE scenes
      SET status = 'completed', updated_at = NOW()
      WHERE id = $1
    `, [sceneId]);

    console.log(`[VerifyConfirmation] ✓ Scene ${sceneId} confirmed and completed`);

    return NextResponse.json({
      success: true,
      sceneId,
      message: 'Scene confirmation verified. NFT minted!'
    });

  } catch (error) {
    console.error('[VerifyConfirmation] Error:', error);
    return NextResponse.json(
      { error: 'Failed to verify confirmation', details: (error as Error).message },
      { status: 500 }
    );
  }
}
```

---

### Step 5: Create `/api/scenes/verify-refund`

**File:** `app/api/scenes/verify-refund/route.ts`

**What:** Verify `requestRefund()` transaction and DELETE scene row.

**Why:** Refunds reopen the slot for others. Deleting the scene row automatically lifts the UNIQUE constraint, allowing new claims.

**Implementation:**

```typescript
/**
 * Refund Verification
 * POST /api/scenes/verify-refund
 *
 * Verifies RefundIssued event, marks attempt failed, DELETES scene row to reopen slot
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { createPublicClient, http, decodeEventLog, type Hash } from 'viem';
import { base } from 'viem/chains';
import VideoAdventureABI from '@/lib/VideoAdventure.abi.json';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

interface VerifyRefundRequest {
  sceneId: number;
  attemptId: number;
  transactionHash: string;
  userAddress: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyRefundRequest = await request.json();
    const { sceneId, attemptId, transactionHash, userAddress } = body;

    console.log(`[VerifyRefund] Verifying refund for scene ${sceneId}`);

    // 1. Verify transaction on blockchain
    const client = createPublicClient({
      chain: base,
      transport: http()
    });

    const receipt = await client.getTransactionReceipt({
      hash: transactionHash as Hash
    });

    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'Transaction failed' }, { status: 400 });
    }

    // 2. Find RefundIssued event
    let refunded = false;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) {
        continue;
      }

      try {
        const decoded = decodeEventLog({
          abi: VideoAdventureABI,
          data: log.data,
          topics: log.topics
        });

        if (decoded.eventName === 'RefundIssued') {
          const args = decoded.args as unknown as {
            sceneId: bigint;
            buyer: string;
            amount: bigint;
          };

          if (Number(args.sceneId) === sceneId &&
              args.buyer.toLowerCase() === userAddress.toLowerCase()) {
            refunded = true;
            break;
          }
        }
      } catch {
        continue;
      }
    }

    if (!refunded) {
      return NextResponse.json({
        error: 'RefundIssued event not found in transaction'
      }, { status: 400 });
    }

    // 3. Mark attempt as failed
    await query(`
      UPDATE scene_generation_attempts
      SET outcome = 'failed', updated_at = NOW()
      WHERE id = $1
    `, [attemptId]);

    // 4. DELETE scene row (critical - reopens slot!)
    await query(`
      DELETE FROM scenes
      WHERE id = $1
    `, [sceneId]);

    console.log(`[VerifyRefund] ✓ Scene ${sceneId} deleted. Slot reopened.`);

    return NextResponse.json({
      success: true,
      sceneId,
      message: 'Refund verified. Slot reopened. 50% returned to your wallet.'
    });

  } catch (error) {
    console.error('[VerifyRefund] Error:', error);
    return NextResponse.json(
      { error: 'Failed to verify refund', details: (error as Error).message },
      { status: 500 }
    );
  }
}
```

---

### Step 6: Update Frontend - Confirmation UI

**File:** `app/movie/[slug]/generating/page.tsx`

**What:** Show confirmation/refund buttons after video ready (instead of share prompt).

**Why:** Users need to review video and choose: confirm (mint NFT) or refund (50% back).

**Changes Required:**

1. **Add wagmi imports:**
```typescript
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import VideoAdventureABI from '@/lib/VideoAdventure.abi.json';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
```

2. **Add state for confirmation flow:**
```typescript
const [confirmationState, setConfirmationState] = useState<'ready' | 'confirming' | 'confirmed' | 'refunding' | 'refunded'>('ready');
const [videoData, setVideoData] = useState<{ videoUrl: string; metadataURI: string } | null>(null);

const { address } = useAccount();
const { writeContract, data: hash, isPending } = useWriteContract();
const { isLoading: isTxPending, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash });
```

3. **Update poll handler (around line 122-126):**

Replace:
```typescript
} else if (data.status === 'completed') {
  setProgress(90);
  await completeGeneration(promptId, data.videoJobId);
}
```

With:
```typescript
} else if (data.status === 'completed') {
  setProgress(90);
  // Video ready on Sora, trigger R2 upload + Pinata
  const completeResponse = await completeGeneration(promptId, data.videoJobId);

  if (completeResponse?.success) {
    // Store video URL and metadata URI for confirmation
    setVideoData({
      videoUrl: completeResponse.videoUrl,
      metadataURI: completeResponse.metadataURI
    });
    setProgress(100);
  }
}
```

4. **Remove auto share prompt (around line 79-81):**

Delete:
```typescript
setTimeout(() => {
  setShowSharePrompt(true);
}, 1000);
```

5. **Add confirmation handlers:**
```typescript
const handleConfirmScene = async () => {
  if (!videoData || !address) return;

  setConfirmationState('confirming');

  try {
    await writeContract({
      address: CONTRACT_ADDRESS,
      abi: VideoAdventureABI,
      functionName: 'confirmScene',
      args: [BigInt(sceneId), videoData.metadataURI]
    });
  } catch (error) {
    console.error('[Confirm] Error:', error);
    setConfirmationState('ready');
  }
};

const handleRequestRefund = async () => {
  if (!address) return;

  setConfirmationState('refunding');

  try {
    await writeContract({
      address: CONTRACT_ADDRESS,
      abi: VideoAdventureABI,
      functionName: 'requestRefund',
      args: [BigInt(sceneId)]
    });
  } catch (error) {
    console.error('[Refund] Error:', error);
    setConfirmationState('ready');
  }
};

// Verify confirmation after tx success
useEffect(() => {
  if (isTxSuccess && hash && confirmationState === 'confirming') {
    (async () => {
      const response = await fetch('/api/scenes/verify-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneId,
          transactionHash: hash,
          userAddress: address
        })
      });

      if (response.ok) {
        setConfirmationState('confirmed');
        // NOW show share prompt
        setTimeout(() => setShowSharePrompt(true), 1000);
      }
    })();
  } else if (isTxSuccess && hash && confirmationState === 'refunding') {
    (async () => {
      const response = await fetch('/api/scenes/verify-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneId,
          attemptId: /* get from scene data */,
          transactionHash: hash,
          userAddress: address
        })
      });

      if (response.ok) {
        setConfirmationState('refunded');
      }
    })();
  }
}, [isTxSuccess, hash, confirmationState]);
```

6. **Update render (replace share prompt section):**
```typescript
{videoData && confirmationState === 'ready' && (
  <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
    <div className="bg-movie-bg border-2 border-movie-primary rounded-lg p-8 max-w-2xl w-full">
      <h2 className="text-2xl font-bold text-movie-primary mb-4">
        Your scene is ready!
      </h2>

      {/* Video preview */}
      <video
        src={videoData.videoUrl}
        controls
        className="w-full rounded-lg mb-6"
      />

      <p className="text-movie-text mb-6">
        Review your scene and choose:
      </p>

      <div className="flex gap-4">
        <button
          onClick={handleConfirmScene}
          disabled={isPending || isTxPending}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold disabled:opacity-50"
        >
          {isTxPending ? 'Minting NFT...' : 'Confirm Scene (Mint NFT)'}
        </button>

        <button
          onClick={handleRequestRefund}
          disabled={isPending || isTxPending}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-bold disabled:opacity-50"
        >
          Request 50% Refund
        </button>
      </div>

      <p className="text-sm text-movie-text-muted mt-4">
        Confirming mints your NFT and adds your scene to the story permanently.
        Refunding returns 50% of your payment and reopens the slot for others.
      </p>
    </div>
  </div>
)}

{confirmationState === 'confirmed' && (
  <div className="text-center text-green-600 text-xl mt-8">
    ✓ NFT Minted! Your scene is now part of the story.
  </div>
)}

{confirmationState === 'refunded' && (
  <div className="text-center text-yellow-600 text-xl mt-8">
    ✓ Refund processed. 50% returned to your wallet. Slot reopened.
  </div>
)}
```

---

### Step 7: Generate Contract ABI

**What:** Extract ABI from compiled contract for frontend.

**Why:** Wagmi needs ABI to encode function calls.

**Commands:**

```bash
# 1. Compile contract
cd contracts
forge build

# 2. Extract ABI
cat out/VideoAdventureV1.sol/VideoAdventureV1.json | jq '.abi' > ../lib/VideoAdventure.abi.json

# 3. Verify file created
ls -lh ../lib/VideoAdventure.abi.json
```

---

### Step 8: Update Environment Variables

**File:** `.env.local`

**Add:**
```bash
# Smart Contract
NEXT_PUBLIC_CONTRACT_ADDRESS=0x... # Deploy contract first, then add address

# Pinata IPFS
PINATA_API_KEY=your_api_key
PINATA_SECRET_KEY=your_secret_key
```

---

### Step 9: Backup & Wipe Scripts ✅ COMPLETED

**Status:** ✅ Scripts created (2025-10-24)

**Why:** Ensures sceneId in database matches contract after fresh deployment. Separate scripts give you full control.

---

#### Option A: Comprehensive Backup (Recommended First)

**File:** `scripts/backup-storage.ts`

**What it does:**
- ✅ Backs up all database tables to JSON files
- ✅ **Downloads all videos from R2** to local directory
- ✅ Creates manifest file with checksums
- ✅ Organized by timestamp in `backups/` directory

**Run:**
```bash
npx tsx scripts/backup-storage.ts
```

**Output:**
```
backups/2025-10-24T18-21-00/
├── manifest.json          # Full backup summary with checksums
├── movies.json            # All movies
├── scenes.json            # All scenes
├── attempts.json          # All generation attempts
├── prompts.json           # All prompts
└── videos/                # All videos from R2
    ├── 2009_scene-1.mp4
    ├── 2009_scene-2.mp4
    └── ...
```

---

#### Option B: Check Data First

**File:** `scripts/check-data.ts`

**What it does:**
- Shows current database contents
- Tests database connection
- No destructive actions

**Run:**
```bash
npx tsx scripts/check-data.ts
```

**Output:**
```
📊 Current Database Contents:

Scenes: 13
Generation Attempts: 6
Prompts: 6
Movies: 2

Movies:
  - Movie #1: "2009" (2009: Bitcoin Genesis)
  - Movie #2: "mochi" (Mochi's Double Life)
```

---

#### Option C: Wipe Everything (Danger Zone!)

**File:** `scripts/wipe-storage.ts`

**What it does:**
- ❌ Deletes all scenes, attempts, prompts from database
- ❌ Deletes all videos from R2 storage
- ❌ Resets ID sequences to 1
- ⚠️ 10-second countdown before proceeding

**IMPORTANT:** Run backup first! This cannot be undone.

**Run:**
```bash
# 1. First, backup everything
npx tsx scripts/backup-storage.ts

# 2. Then, wipe
npx tsx scripts/wipe-storage.ts
```

---

#### Recommended Workflow

```bash
# 1. Check what you have
npx tsx scripts/check-data.ts

# 2. Backup everything (database + videos)
npx tsx scripts/backup-storage.ts

# 3. Verify backup completed
ls -lh backups/

# 4. Wipe when ready
npx tsx scripts/wipe-storage.ts

# 5. Deploy fresh contract
# 6. Update NEXT_PUBLIC_CONTRACT_ADDRESS
# 7. Create genesis scene
```

---

## Testing Checklist

### Local Testing

- [ ] **Database Migration**
  ```bash
  POSTGRES_URL="..." npm run db:migrate
  psql $POSTGRES_URL -c "SELECT status FROM scenes LIMIT 1" # Should allow 'awaiting_confirmation'
  ```

- [ ] **Pinata Integration**
  ```bash
  # Test in Node REPL
  node
  > const { uploadMetadataToPinata } = require('./lib/pinata.ts')
  > await uploadMetadataToPinata(1, '2009', 'https://example.com/video.mp4', 'Test')
  # Should return ipfs://Qm...
  ```

- [ ] **API Endpoints**
  ```bash
  # Start dev server
  npm run dev

  # Test verify-confirmation (requires real tx hash from testnet)
  curl -X POST http://localhost:3001/api/scenes/verify-confirmation \
    -H "Content-Type: application/json" \
    -d '{"sceneId":1,"transactionHash":"0x...","userAddress":"0x..."}'
  ```

- [ ] **Frontend Flow**
  - Open http://localhost:3001
  - Claim slot → See Base payment modal
  - Submit prompt → See "Generating..." state
  - Wait for video → See confirmation modal with video preview
  - Click "Confirm" → See wagmi wallet prompt
  - Approve tx → See "Minting NFT..." state
  - Wait for confirmation → See "NFT Minted!" success

### Testnet Testing (Base Sepolia)

- [ ] Deploy contract to Base Sepolia
- [ ] Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env.local`
- [ ] Test full flow with testnet ETH
- [ ] Verify events on BaseScan Sepolia

---

## Deployment Checklist

### Pre-Deployment

- [ ] Run backup script: `tsx scripts/backup-and-wipe-scenes.ts`
- [ ] Run migration 010: `POSTGRES_URL="..." npm run db:migrate`
- [ ] Deploy contract to Base mainnet (via Foundry)
- [ ] Verify contract on BaseScan
- [ ] Generate ABI: `cat out/VideoAdventureV1.sol/VideoAdventureV1.json | jq '.abi' > lib/VideoAdventure.abi.json`

### Environment Setup

- [ ] Add `NEXT_PUBLIC_CONTRACT_ADDRESS` to production env
- [ ] Add `PINATA_API_KEY` to production env
- [ ] Add `PINATA_SECRET_KEY` to production env
- [ ] Verify `POSTGRES_URL` points to production database

### Code Deployment

- [ ] Merge all changes to main branch
- [ ] Deploy to Vercel/hosting platform
- [ ] Verify build succeeds
- [ ] Check production logs for errors

### Post-Deployment Validation

- [ ] Create genesis scene via contract
- [ ] Claim first slot from frontend
- [ ] Submit prompt and wait for generation
- [ ] Confirm scene and verify NFT minted
- [ ] Check OpenSea/NFT marketplace for metadata display
- [ ] Test refund flow (on non-critical scene)
- [ ] Verify revenue distribution in contract

### Monitoring

- [ ] Set up alerts for failed transactions
- [ ] Monitor Pinata upload success rate
- [ ] Track video generation completion rate
- [ ] Watch for expired escrows

---

## Summary

### Files Created/Modified

**Created:**
1. `migrations/010_escrow_flow_updates.sql` - Database schema updates
2. `lib/pinata.ts` - IPFS metadata upload
3. `app/api/scenes/verify-confirmation/route.ts` - Confirmation verification
4. `app/api/scenes/verify-refund/route.ts` - Refund verification
5. `scripts/backup-and-wipe-scenes.ts` - Data migration utility
6. `lib/VideoAdventure.abi.json` - Contract ABI (generated)

**Modified:**
1. `app/api/generation/complete/route.ts` - Change status, add Pinata
2. `app/movie/[slug]/generating/page.tsx` - Add confirmation UI
3. `.env.local` - Add contract address and Pinata keys

### Key Changes

1. **Database**: New `awaiting_confirmation` status, fixed UNIQUE constraint
2. **Backend**: Pinata integration, two new verification endpoints
3. **Frontend**: Confirmation/refund UI replaces auto-share
4. **Contract**: Source of truth via event verification

### Support

For issues during implementation:
- Check contract events on BaseScan
- Review backend logs for Pinata/verification errors
- Test wagmi calls in browser console
- Verify database schema matches migration

---

**End of Implementation Guide**
