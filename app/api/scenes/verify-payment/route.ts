/**
 * Payment Verification API
 * POST /api/scenes/verify-payment
 *
 * Verifies on-chain transaction and creates generation attempt
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifySceneCreation } from '@/lib/verifyTransaction';
import type { Hash } from 'viem';

interface VerifyPaymentRequest {
  sceneId: number;
  transactionHash: string;
  userAddress: string;
  fid?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyPaymentRequest = await request.json();
    const { sceneId, transactionHash, userAddress, fid } = body;

    // Validate inputs
    if (!sceneId || isNaN(sceneId)) {
      return NextResponse.json(
        { error: 'Invalid scene ID' },
        { status: 400 }
      );
    }

    if (!transactionHash || !transactionHash.startsWith('0x')) {
      return NextResponse.json(
        { error: 'Invalid transaction hash' },
        { status: 400 }
      );
    }

    if (!userAddress || !userAddress.startsWith('0x')) {
      return NextResponse.json(
        { error: 'Invalid user address' },
        { status: 400 }
      );
    }

    // Fetch scene from database to get parent_id and slot
    const sceneResult = await query(`
      SELECT id, parent_id, slot, status, locked_by_address
      FROM scenes
      WHERE id = $1
    `, [sceneId]);

    if (sceneResult.rowCount === 0) {
      return NextResponse.json(
        { error: 'Scene not found' },
        { status: 404 }
      );
    }

    const scene = sceneResult.rows[0];

    // Verify the user has the lock
    if (scene.locked_by_address?.toLowerCase() !== userAddress.toLowerCase()) {
      return NextResponse.json(
        { error: 'You do not hold the lock for this scene' },
        { status: 403 }
      );
    }

    // Update scene status to verifying_payment
    await query(`
      UPDATE scenes
      SET status = 'verifying_payment', updated_at = NOW()
      WHERE id = $1
    `, [sceneId]);

    // Verify transaction on blockchain
    let verificationResult;
    try {
      // Convert slot letter to number (A=0, B=1, C=2)
      const slotNumber = scene.slot === 'A' ? 0 : scene.slot === 'B' ? 1 : 2;

      verificationResult = await verifySceneCreation(
        transactionHash as Hash,
        userAddress,
        scene.parent_id,
        slotNumber
      );

      console.log('Blockchain verification successful:', verificationResult);
    } catch (error) {
      console.error('Blockchain verification failed:', error);

      // Update scene back to lock_expired
      await query(`
        UPDATE scenes
        SET status = 'lock_expired', updated_at = NOW()
        WHERE id = $1
      `, [sceneId]);

      return NextResponse.json(
        {
          error: 'Transaction verification failed',
          details: (error as Error).message
        },
        { status: 400 }
      );
    }

    // Create scene_generation_attempts row
    const retryWindowExpires = new Date(Date.now() + 3600000); // 1 hour from now

    const attemptResult = await query(`
      INSERT INTO scene_generation_attempts (
        scene_id,
        creator_address,
        creator_fid,
        transaction_hash,
        payment_confirmed_at,
        retry_window_expires_at,
        outcome,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW(), $5, 'in_progress', NOW(), NOW())
      RETURNING id, retry_window_expires_at
    `, [
      sceneId,
      userAddress.toLowerCase(),
      fid || null,
      transactionHash,
      retryWindowExpires
    ]);

    const attempt = attemptResult.rows[0];

    // Update scene status to awaiting_prompt
    await query(`
      UPDATE scenes
      SET
        status = 'awaiting_prompt',
        current_attempt_id = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [attempt.id, sceneId]);

    return NextResponse.json({
      success: true,
      attemptId: attempt.id,
      sceneId: sceneId,
      onChainSceneId: verificationResult.sceneId,
      retryWindowExpires: attempt.retry_window_expires_at,
      expiresIn: 3600 // seconds
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    return NextResponse.json(
      {
        error: 'Failed to verify payment',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
