/**
 * DEBUG: Cleanup Stuck Locks API
 * POST /api/debug/cleanup-stuck-locks
 *
 * Fixes scenes that are in 'awaiting_prompt' or 'generating' status
 * but don't have an active scene_generation_attempt
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface StuckSceneRow {
  id: number;
  parent_id: number | null;
  slot: string;
  status: string;
  locked_until: Date | null;
  current_attempt_id: number | null;
  attempt_id: number | null;
  attempt_outcome: string | null;
  retry_window_expires_at: Date | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress, dryRun = true } = body;

    if (!userAddress || !userAddress.startsWith('0x')) {
      return NextResponse.json(
        { error: 'Invalid or missing wallet address' },
        { status: 400 }
      );
    }

    // Find scenes that are blocking but don't have active attempts
    const stuckScenes = await query<StuckSceneRow>(`
      SELECT
        s.id,
        s.parent_id,
        s.slot,
        s.status,
        s.locked_until,
        s.current_attempt_id,
        sga.id as attempt_id,
        sga.outcome as attempt_outcome,
        sga.retry_window_expires_at
      FROM scenes s
      LEFT JOIN scene_generation_attempts sga ON s.current_attempt_id = sga.id
      WHERE s.locked_by_address = $1
        AND s.status IN ('locked', 'verifying_payment', 'awaiting_prompt', 'generating')
        AND (
          -- No attempt at all
          sga.id IS NULL
          -- Or attempt is not in progress
          OR sga.outcome != 'in_progress'
          -- Or retry window expired
          OR sga.retry_window_expires_at <= NOW()
          -- Or lock expired (for 'locked' status)
          OR (s.status = 'locked' AND s.locked_until <= NOW())
        )
    `, [userAddress.toLowerCase()]);

    if (stuckScenes.rows.length === 0) {
      return NextResponse.json({
        message: 'No stuck locks found',
        cleaned: 0
      });
    }

    if (dryRun) {
      return NextResponse.json({
        message: 'DRY RUN: Would clean these scenes',
        stuckScenes: stuckScenes.rows,
        count: stuckScenes.rows.length,
        note: 'Set dryRun=false to actually clean'
      });
    }

    // Clean up stuck scenes
    const cleanupResult = await query(`
      UPDATE scenes
      SET
        status = CASE
          WHEN status = 'locked' THEN 'lock_expired'
          ELSE 'failed'
        END,
        locked_until = NULL,
        locked_by_address = NULL,
        locked_by_fid = NULL,
        updated_at = NOW()
      WHERE id = ANY($1::int[])
      RETURNING id, status
    `, [stuckScenes.rows.map(s => s.id)]);

    // Also update any stuck attempts to 'failed'
    const attemptIds = stuckScenes.rows
      .filter(s => s.attempt_id !== null)
      .map(s => s.attempt_id);

    let attemptCleanupResult = null;
    if (attemptIds.length > 0) {
      attemptCleanupResult = await query(`
        UPDATE scene_generation_attempts
        SET
          outcome = 'failed',
          updated_at = NOW()
        WHERE id = ANY($1::int[])
          AND outcome = 'in_progress'
        RETURNING id, outcome
      `, [attemptIds]);
    }

    return NextResponse.json({
      message: 'Successfully cleaned stuck locks',
      cleanedScenes: cleanupResult.rows,
      cleanedAttempts: attemptCleanupResult?.rows || [],
      total: {
        scenes: cleanupResult.rows.length,
        attempts: attemptCleanupResult?.rows.length || 0
      }
    });

  } catch (error) {
    console.error('Error cleaning stuck locks:', error);
    return NextResponse.json(
      {
        error: 'Failed to clean stuck locks',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
