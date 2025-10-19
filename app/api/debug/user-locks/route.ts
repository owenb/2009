/**
 * DEBUG: User Lock Status API
 * GET /api/debug/user-locks?address=0x...
 *
 * Shows all locks and attempts for a user to diagnose stuck states
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface SceneRow {
  id: number;
  parent_id: number | null;
  slot: string;
  status: string;
  locked_until: Date | null;
  locked_by_address: string | null;
  current_attempt_id: number | null;
  created_at: Date;
  updated_at: Date;
}

interface AttemptRow {
  attempt_id: number;
  scene_id: number;
  outcome: string;
  retry_window_expires_at: Date;
  created_at: Date;
  payment_confirmed_at: Date;
  scene_status: string;
  parent_id: number | null;
  slot: string;
}

interface PromptRow {
  id: number;
  attempt_id: number;
  outcome: string;
  video_job_id: string | null;
  submitted_at: Date;
  scene_id: number;
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

    // Get all scenes locked by this user
    const scenesResult = await query<SceneRow>(`
      SELECT
        id,
        parent_id,
        slot,
        status,
        locked_until,
        locked_by_address,
        current_attempt_id,
        created_at,
        updated_at
      FROM scenes
      WHERE locked_by_address = $1
      ORDER BY updated_at DESC
    `, [userAddress.toLowerCase()]);

    // Get all generation attempts by this user
    const attemptsResult = await query<AttemptRow>(`
      SELECT
        sga.id as attempt_id,
        sga.scene_id,
        sga.outcome,
        sga.retry_window_expires_at,
        sga.created_at,
        sga.payment_confirmed_at,
        s.status as scene_status,
        s.parent_id,
        s.slot
      FROM scene_generation_attempts sga
      LEFT JOIN scenes s ON s.id = sga.scene_id
      WHERE sga.creator_address = $1
      ORDER BY sga.created_at DESC
      LIMIT 20
    `, [userAddress.toLowerCase()]);

    // Get all prompts for this user's attempts
    const promptsResult = await query<PromptRow>(`
      SELECT
        p.id,
        p.attempt_id,
        p.outcome,
        p.video_job_id,
        p.submitted_at,
        sga.scene_id
      FROM prompts p
      JOIN scene_generation_attempts sga ON sga.id = p.attempt_id
      WHERE sga.creator_address = $1
      ORDER BY p.submitted_at DESC
      LIMIT 20
    `, [userAddress.toLowerCase()]);

    return NextResponse.json({
      userAddress,
      scenes: scenesResult.rows,
      attempts: attemptsResult.rows,
      prompts: promptsResult.rows,
      diagnostics: {
        totalScenesLocked: scenesResult.rows.length,
        totalAttempts: attemptsResult.rows.length,
        totalPrompts: promptsResult.rows.length,
        scenesBlockingLocks: scenesResult.rows.filter(s =>
          (s.status === 'locked' && s.locked_until && new Date(s.locked_until) > new Date()) ||
          ['verifying_payment', 'awaiting_prompt', 'generating'].includes(s.status)
        ),
        activeAttempts: attemptsResult.rows.filter(a =>
          a.outcome === 'in_progress' &&
          new Date(a.retry_window_expires_at) > new Date()
        )
      }
    });

  } catch (error) {
    console.error('Error fetching debug info:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch debug info',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
