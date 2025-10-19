/**
 * Active Attempts API
 * GET /api/user/active-attempts?address=0x...
 *
 * Returns all active generation attempts for a user (not expired, outcome = 'in_progress')
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface ActiveAttemptRow {
  attempt_id: number;
  scene_id: number;
  parent_id: number | null;
  slot: string;
  retry_window_expires_at: Date;
  created_at: Date;
  payment_confirmed_at: Date;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('address');

    if (!userAddress || !userAddress.startsWith('0x')) {
      return NextResponse.json(
        { error: 'Invalid or missing wallet address' },
        { status: 400 }
      );
    }

    // Query for active attempts (not expired, outcome = 'in_progress')
    const result = await query<ActiveAttemptRow>(`
      SELECT
        sga.id as attempt_id,
        sga.scene_id,
        s.parent_id,
        s.slot,
        sga.retry_window_expires_at,
        sga.created_at,
        sga.payment_confirmed_at
      FROM scene_generation_attempts sga
      JOIN scenes s ON s.id = sga.scene_id
      WHERE
        sga.creator_address = $1
        AND sga.outcome = 'in_progress'
        AND sga.retry_window_expires_at > NOW()
      ORDER BY sga.created_at DESC
    `, [userAddress.toLowerCase()]);

    const attempts = result.rows.map(row => ({
      attemptId: row.attempt_id,
      sceneId: row.scene_id,
      parentId: row.parent_id,
      slot: row.slot,
      expiresAt: row.retry_window_expires_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      paymentConfirmedAt: row.payment_confirmed_at.toISOString(),
      timeRemainingMs: new Date(row.retry_window_expires_at).getTime() - Date.now()
    }));

    return NextResponse.json({
      attempts,
      hasActiveAttempts: attempts.length > 0
    });

  } catch (error) {
    console.error('Error fetching active attempts:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch active attempts',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
