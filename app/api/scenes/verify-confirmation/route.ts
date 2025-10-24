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

    const scene = sceneResult.rows[0] as {
      id: number;
      status: string;
      creator_address: string | null;
    };

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
