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
