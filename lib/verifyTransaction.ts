/**
 * Smart Contract Transaction Verification Utility
 * Verifies VideoAdventure contract transactions on Base blockchain
 */

import { createPublicClient, http, type Address, type Hash } from 'viem';
import { base } from 'viem/chains';
import VideoAdventureABI from './VideoAdventure.abi.json';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address;

export interface VerificationResult {
  verified: boolean;
  sceneId: number;
  parentId: number;
  slot: number;
  creator: string;
  blockNumber: bigint;
  transactionHash: string;
}

/**
 * Verify a scene creation transaction on Base blockchain
 * @param txHash - Transaction hash
 * @param expectedCreator - Expected creator address
 * @param expectedParentId - Expected parent scene ID
 * @param expectedSlot - Expected slot (0=A, 1=B, 2=C)
 * @returns Verification result with scene details
 */
export async function verifySceneCreation(
  txHash: Hash,
  expectedCreator: string,
  expectedParentId: number,
  expectedSlot: number
): Promise<VerificationResult> {
  // Create public client for Base mainnet
  const client = createPublicClient({
    chain: base,
    transport: http()
  });

  // Step 1: Verify transaction succeeded
  const receipt = await client.getTransactionReceipt({ hash: txHash });

  if (receipt.status !== 'success') {
    throw new Error('Transaction failed on blockchain');
  }

  // Step 2: Query contract state to verify the slot was actually claimed
  // Get the child scenes for this parent
  const childScenes = await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: VideoAdventureABI,
    functionName: 'getChildScenes',
    args: [BigInt(expectedParentId)]
  }) as [bigint, bigint, bigint];

  // Check if the expected slot now has a scene ID
  const claimedSceneId = childScenes[expectedSlot];

  if (claimedSceneId === BigInt(0)) {
    throw new Error(`Slot ${expectedSlot} was not claimed in this transaction`);
  }

  // Step 3: Verify the scene details match what we expect
  const sceneDetails = await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: VideoAdventureABI,
    functionName: 'getScene',
    args: [claimedSceneId]
  }) as [bigint, number, Address, boolean];

  const [parentId, slot, creator, exists] = sceneDetails;

  if (!exists) {
    throw new Error('Scene does not exist on chain');
  }

  if (creator.toLowerCase() !== expectedCreator.toLowerCase()) {
    throw new Error(
      `Scene was claimed by different address. Expected ${expectedCreator}, got ${creator}`
    );
  }

  if (Number(parentId) !== expectedParentId) {
    throw new Error(
      `Parent ID mismatch. Expected ${expectedParentId}, got ${parentId}`
    );
  }

  if (slot !== expectedSlot) {
    throw new Error(
      `Slot mismatch. Expected ${expectedSlot}, got ${slot}`
    );
  }

  // All validations passed!
  return {
    verified: true,
    sceneId: Number(claimedSceneId),
    parentId: Number(parentId),
    slot: slot,
    creator: creator,
    blockNumber: receipt.blockNumber,
    transactionHash: txHash
  };
}

/**
 * Get scene details from smart contract
 * @param sceneId - Scene ID to query
 * @returns Scene details from blockchain
 */
export async function getSceneFromContract(sceneId: number): Promise<{
  parentId: number;
  slot: number;
  creator: string;
  exists: boolean;
}> {
  const client = createPublicClient({
    chain: base,
    transport: http()
  });

  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: VideoAdventureABI,
    functionName: 'getScene',
    args: [BigInt(sceneId)]
  }) as [bigint, number, Address, boolean];

  const [parentId, slot, creator, exists] = result;

  return {
    parentId: Number(parentId),
    slot,
    creator,
    exists
  };
}

/**
 * Get available slots for a parent scene from smart contract
 * @param parentId - Parent scene ID
 * @returns Array of 3 booleans indicating slot availability
 */
export async function getAvailableSlotsFromContract(parentId: number): Promise<[boolean, boolean, boolean]> {
  const client = createPublicClient({
    chain: base,
    transport: http()
  });

  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: VideoAdventureABI,
    functionName: 'getAvailableSlots',
    args: [BigInt(parentId)]
  }) as [boolean, boolean, boolean];

  return result;
}

/**
 * Get child scene IDs for a parent from smart contract
 * @param parentId - Parent scene ID
 * @returns Array of 3 scene IDs (0 if slot is empty)
 */
export async function getChildScenesFromContract(parentId: number): Promise<[bigint, bigint, bigint]> {
  const client = createPublicClient({
    chain: base,
    transport: http()
  });

  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: VideoAdventureABI,
    functionName: 'getChildScenes',
    args: [BigInt(parentId)]
  }) as [bigint, bigint, bigint];

  return result;
}

/**
 * Get total number of scenes from smart contract
 * @returns Total scenes created
 */
export async function getTotalScenesFromContract(): Promise<number> {
  const client = createPublicClient({
    chain: base,
    transport: http()
  });

  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: VideoAdventureABI,
    functionName: 'getTotalScenes'
  }) as bigint;

  return Number(result);
}

/**
 * Verify transaction exists and is confirmed (without event validation)
 * Useful for quick checks before full verification
 * @param txHash - Transaction hash
 * @returns True if transaction is confirmed
 */
export async function isTransactionConfirmed(txHash: Hash): Promise<boolean> {
  try {
    const client = createPublicClient({
      chain: base,
      transport: http()
    });

    const receipt = await client.getTransactionReceipt({ hash: txHash });
    return receipt.status === 'success';
  } catch (error) {
    console.error('Error checking transaction confirmation:', error);
    return false;
  }
}

/**
 * Get current block number on Base mainnet
 * @returns Current block number
 */
export async function getCurrentBlockNumber(): Promise<bigint> {
  const client = createPublicClient({
    chain: base,
    transport: http()
  });

  return await client.getBlockNumber();
}
