# Smart Contract Deployment & Scene Ownership Guide

## Overview

This guide walks you through deploying the `VideoAdventureV1` smart contract to Base Sepolia testnet and linking your manually seeded Mochi scenes to on-chain ownership.

**Current Database State:**
- Movie: Mochi (ID: 1)
- Genesis Scene: 100
- Branch Scenes: 101 (A), 102 (B), 103 (C), 104 (A from 101)

---

## Prerequisites

### 1. Set Up Your Wallet
```bash
# Generate a new wallet for testnet (or use existing)
export DEPLOYER_PRIVATE_KEY="your_private_key_here"
export DEPLOYER_ADDRESS="your_address_here"
```

### 2. Get Base Sepolia ETH
- Visit [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
- Or [Alchemy Faucet](https://sepoliafaucet.com/)
- Fund your deployer address with ~0.5 ETH for deployment + transactions

### 3. Verify Foundry is Installed
```bash
forge --version
# If not installed: curl -L https://foundry.paradigm.xyz | bash && foundryup
```

---

## Step-by-Step Deployment

### Phase 1: Deploy Smart Contract

```bash
# 1. Set your deployer wallet
export DEPLOYER_PRIVATE_KEY="0xYourPrivateKey"
export DEPLOYER_ADDRESS="0xYourAddress"

# 2. Set treasury address (where platform fees go)
# For testing, can be same as deployer
export TREASURY_ADDRESS="$DEPLOYER_ADDRESS"

# 3. Deploy to Base Sepolia
./scripts/deploy-contract.sh base_sepolia
```

**Expected Output:**
```
🚀 Deploying VideoAdventureV1 to base_sepolia...
📍 Treasury: 0xYourAddress
1️⃣ Deploying implementation contract...
✅ Implementation deployed: 0x...
2️⃣ Encoding initializer...
3️⃣ Deploying proxy...
✅ Proxy deployed: 0x...
════════════════════════════════════════
🎉 DEPLOYMENT SUCCESSFUL
════════════════════════════════════════
Proxy (USE THIS): 0xABC123...
```

**Action:** Copy the proxy address and update `.env.local`:
```bash
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYourProxyAddress
NEXT_PUBLIC_CHAIN_ID=84532
```

---

### Phase 2: Create Movie On-Chain

The smart contract has two ways to create movies:
- `createPlatformMovie()` - No deposit, immediate activation (for official movies)
- `createMovie()` - Requires 2 ETH deposit, needs approval (for partners)

For the Mochi movie, we'll use `createPlatformMovie()`:

```bash
# Set variables
export CONTRACT_ADDRESS="0xYourProxyAddress"
export MOVIE_CREATOR="0xYourAddress"  # Who receives 55% of revenue
export SCENE_PRICE="56000000000000"   # 0.000056 ETH (from .env.local)

# Create Mochi movie (movieId will be 1)
cast send $CONTRACT_ADDRESS \
  "createPlatformMovie(string,string,address,uint256)" \
  "mochi" \
  "Mochi's Double Life" \
  $MOVIE_CREATOR \
  $SCENE_PRICE \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY
```

**Verify:**
```bash
# Get movie details
cast call $CONTRACT_ADDRESS \
  "getMovieBySlug(string)(uint256,string,string,address,uint256,uint256,uint8,uint256,uint256,bool)" \
  "mochi" \
  --rpc-url https://sepolia.base.org
```

You should see:
- `id: 1`
- `slug: "mochi"`
- `status: 1` (Active)

---

### Phase 3: Create Genesis Scene On-Chain

The genesis scene is special - it's minted directly by the platform, not through the normal escrow flow.

```bash
# Create genesis scene for Mochi (sceneId will be 1)
cast send $CONTRACT_ADDRESS \
  "createGenesisScene(uint256,string)" \
  1 \
  "ipfs://Qm...Mochi-Genesis-Metadata" \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --gas-limit 500000
```

**Note:** You'll need to create IPFS metadata for the genesis scene. For now, you can use a placeholder URI.

**Verify:**
```bash
# Get genesis scene details
cast call $CONTRACT_ADDRESS \
  "getScene(uint256)(uint256,uint256,uint256,uint8,address,bool,uint256)" \
  1 \
  --rpc-url https://sepolia.base.org
```

Should return:
- `id: 1`
- `movieId: 1`
- `parentId: 0`
- `slot: 255` (genesis special slot)
- `creator: 0xYourAddress`
- `exists: true`

---

### Phase 4: Handle Branch Scenes

**Important:** Branch scenes (101, 102, 103, 104) that you manually seeded **cannot** be directly minted on-chain because they bypass the normal payment flow.

You have two options:

#### Option A: Let Users Claim Them Organically (Recommended)

Leave the slots open on-chain. When a real user:
1. Visits the site
2. Clicks a slot
3. Pays the scene price
4. Confirms the scene

The backend will:
- Create the scene on-chain via `claimSlot()` + `confirmScene()`
- Update the database
- Mint the NFT to the user

**This is the proper flow** and ensures all payments/revenue distribution works correctly.

#### Option B: Pre-Mint Scenes to Your Wallet (Testnet Only)

If you want these scenes on-chain **for testing purposes**, you'll need to:

1. **Pay for each scene** through the smart contract
2. **Confirm each scene** with proper metadata

```bash
# Example: Claim slot A under genesis (sceneId 100 in DB = sceneId 1 on-chain)
# This will reserve sceneId 2 on-chain

cast send $CONTRACT_ADDRESS \
  "claimSlot(uint256,uint8)" \
  1 \      # parentId (genesis sceneId on-chain)
  0 \      # slot (0=A, 1=B, 2=C)
  --value 56000000000000 \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY

# Then confirm it
cast send $CONTRACT_ADDRESS \
  "confirmScene(uint256,string)" \
  2 \      # sceneId returned from claimSlot
  "ipfs://scene-101-metadata" \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY
```

**Repeat for each scene**: 102 (slot B), 103 (slot C), 104 (slot A under scene 101)

---

## Phase 5: Database-Contract Sync

### Understanding Scene ID Mapping

**Important:** Scene IDs in your database DO NOT match scene IDs on-chain.

| Database | On-Chain | Description |
|----------|----------|-------------|
| Scene 100 | Scene 1 | Genesis |
| Scene 101 | Scene 2 | First branch (if minted) |
| Scene 102 | Scene 3 | Second branch (if minted) |
| Scene 103 | Scene 4 | Third branch (if minted) |
| Scene 104 | Scene 5 | Fourth branch (if minted) |

### Update Database with On-Chain IDs

After minting scenes on-chain, you need to update the database to track the on-chain scene IDs:

```sql
-- Add contract_scene_id column if not exists
ALTER TABLE scenes ADD COLUMN contract_scene_id INTEGER;

-- Update mappings (after minting on-chain)
UPDATE scenes SET contract_scene_id = 1 WHERE id = 100;  -- Genesis
UPDATE scenes SET contract_scene_id = 2 WHERE id = 101;  -- First branch
UPDATE scenes SET contract_scene_id = 3 WHERE id = 102;  -- etc...
```

---

## Phase 6: Verify Everything Works

### 1. Check Movie on Contract
```bash
cast call $CONTRACT_ADDRESS \
  "getMovieBySlug(string)" \
  "mochi" \
  --rpc-url https://sepolia.base.org
```

### 2. Check Genesis Scene
```bash
cast call $CONTRACT_ADDRESS \
  "getScene(uint256)" \
  1 \
  --rpc-url https://sepolia.base.org
```

### 3. Check Available Slots
```bash
# Check which slots are available under genesis
cast call $CONTRACT_ADDRESS \
  "getChildScenes(uint256,uint256)(uint256[3])" \
  1 \  # movieId
  1 \  # parentSceneId (genesis)
  --rpc-url https://sepolia.base.org

# Returns [sceneId_A, sceneId_B, sceneId_C]
# 0 means slot is available
```

### 4. Test Frontend
Visit your local frontend and check:
- Can you view the genesis scene?
- Can you see available slots?
- Can you attempt to claim a slot? (will require wallet connection)

---

## Common Issues & Solutions

### Issue: "Scene price mismatch"
**Solution:** Make sure `NEXT_PUBLIC_SCENE_PRICE` in `.env.local` matches the scene price you set in the contract (in wei).

### Issue: "Transaction reverted"
**Possible causes:**
- Insufficient gas
- Slot already taken
- Movie not active
- Incorrect parameters

**Debug:**
```bash
# Increase gas limit
--gas-limit 1000000

# Check movie status
cast call $CONTRACT_ADDRESS "getMovie(uint256)" 1 --rpc-url https://sepolia.base.org
```

### Issue: "Database scenes don't match contract"
**Solution:** This is expected! Your manually seeded scenes exist ONLY in the database. They won't exist on-chain until someone claims them through the proper flow.

---

## Production Deployment (Base Mainnet)

When ready for mainnet:

```bash
# 1. Deploy to Base mainnet
./scripts/deploy-contract.sh base

# 2. Update .env.local
NEXT_PUBLIC_CONTRACT_ADDRESS=0xNewMainnetAddress
NEXT_PUBLIC_CHAIN_ID=8453

# 3. Create movie on mainnet
# (same commands as above, but use --rpc-url https://mainnet.base.org)

# 4. Create genesis scene

# 5. Let users claim branch scenes organically
```

**DO NOT** manually seed scenes on mainnet - let the full payment flow work.

---

## Summary

✅ **What you've done:**
- Seeded Mochi movie + 5 scenes into database
- Videos uploaded to R2 storage
- Database shows complete story tree

✅ **What deploying the contract does:**
- Creates the Mochi movie on-chain (NFT contract)
- Creates genesis scene (NFT minted to you)
- Opens slots A/B/C for users to claim

✅ **What happens next:**
- Users visit your site
- They claim slots by paying ETH
- Backend calls `claimSlot()` + `confirmScene()`
- NFT minted to user
- Revenue distributed per smart contract logic

🎯 **Recommendation:**
For testnet, deploy the contract and create ONLY the genesis scene. Let the branch scenes (101-104) be re-created through the proper user flow to test the full escrow/payment system.

---

## Quick Reference

### Contract Functions
```solidity
// Platform creates movie (no deposit)
createPlatformMovie(string slug, string title, address creator, uint256 scenePrice)

// Platform mints genesis
createGenesisScene(uint256 movieId, string metadataURI)

// User claims slot (pays scene price)
claimSlot(uint256 parentId, uint8 slot) payable returns (uint256 sceneId)

// User confirms scene (mints NFT)
confirmScene(uint256 sceneId, string metadataURI)

// View functions
getMovieBySlug(string slug) returns (Movie)
getScene(uint256 sceneId) returns (Scene)
getChildScenes(uint256 movieId, uint256 parentId) returns (uint256[3])
isSlotAvailable(uint256 movieId, uint256 parentId, uint8 slot) returns (bool)
```

### Network Details
```
Base Sepolia Testnet:
- RPC: https://sepolia.base.org
- Chain ID: 84532
- Explorer: https://sepolia.basescan.org

Base Mainnet:
- RPC: https://mainnet.base.org
- Chain ID: 8453
- Explorer: https://basescan.org
```
