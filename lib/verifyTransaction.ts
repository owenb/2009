/**
 * Smart Contract Transaction Verification Utility
 * Verifies VideoAdventure contract transactions on Base blockchain
 */

import { createPublicClient, http, decodeEventLog, type Address, type Hash } from 'viem';
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

export interface SceneCreatedEvent {
  sceneId: bigint;
  parentId: bigint;
  slot: number;
  creator: Address;
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

  // Get transaction receipt
  const receipt = await client.getTransactionReceipt({ hash: txHash });

  // Verify transaction succeeded
  if (receipt.status !== 'success') {
    throw new Error('Transaction failed on blockchain');
  }

  // Filter logs from the receipt to find our SceneCreated event
  const eventLog = receipt.logs.find(log =>
    log.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()
  );

  if (!eventLog) {
    throw new Error('No event found from VideoAdventure contract in transaction logs');
  }

  // Decode the event log using our ABI
  const decodedLog = decodeEventLog({
    abi: VideoAdventureABI,
    data: eventLog.data,
    topics: eventLog.topics,
  });

  // Verify this is the SceneCreated event
  if (decodedLog.eventName !== 'SceneCreated') {
    throw new Error(`Expected SceneCreated event, got ${decodedLog.eventName}`);
  }

  // Extract event arguments with proper typing
  const { sceneId, parentId, slot, creator } = decodedLog.args as unknown as SceneCreatedEvent;

  // Validate creator address
  if (creator.toLowerCase() !== expectedCreator.toLowerCase()) {
    throw new Error(
      `Creator mismatch. Expected ${expectedCreator}, got ${creator}`
    );
  }

  // Validate parent ID
  if (Number(parentId) !== expectedParentId) {
    throw new Error(
      `Parent ID mismatch. Expected ${expectedParentId}, got ${parentId}`
    );
  }

  // Validate slot
  if (slot !== expectedSlot) {
    throw new Error(
      `Slot mismatch. Expected ${expectedSlot}, got ${slot}`
    );
  }

  // All validations passed!
  return {
    verified: true,
    sceneId: Number(sceneId),
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
