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
  latest_prompt_id: number | null;
  latest_prompt_outcome: string | null;
  latest_prompt_video_job_id: string | null;
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

    // Query for active attempts with latest prompt info
    const result = await query<ActiveAttemptRow>(`
      SELECT
        sga.id as attempt_id,
        sga.scene_id,
        s.parent_id,
        s.slot,
        sga.retry_window_expires_at,
        sga.created_at,
        sga.payment_confirmed_at,
        p.id as latest_prompt_id,
        p.outcome as latest_prompt_outcome,
        p.video_job_id as latest_prompt_video_job_id
      FROM scene_generation_attempts sga
      JOIN scenes s ON s.id = sga.scene_id
      LEFT JOIN LATERAL (
        SELECT id, outcome, video_job_id
        FROM prompts
        WHERE attempt_id = sga.id
        ORDER BY submitted_at DESC
        LIMIT 1
      ) p ON true
      WHERE
        sga.creator_address = $1
        AND sga.outcome = 'in_progress'
        AND sga.retry_window_expires_at > NOW()
      ORDER BY sga.created_at DESC
    `, [userAddress.toLowerCase()]);

    const attempts = result.rows.map(row => {
      // Check if there's an active prompt (pending or generating)
      const hasActivePrompt = row.latest_prompt_id &&
        (row.latest_prompt_outcome === 'pending' || row.latest_prompt_outcome === 'generating');

      return {
        attemptId: row.attempt_id,
        sceneId: row.scene_id,
        parentId: row.parent_id,
        slot: row.slot,
        expiresAt: row.retry_window_expires_at.toISOString(),
        createdAt: row.created_at.toISOString(),
        paymentConfirmedAt: row.payment_confirmed_at.toISOString(),
        timeRemainingMs: new Date(row.retry_window_expires_at).getTime() - Date.now(),
        // Prompt info
        latestPromptId: row.latest_prompt_id,
        latestPromptOutcome: row.latest_prompt_outcome,
        // Determine correct resume page
        resumePage: hasActivePrompt ? 'generating' : 'create',
        resumeUrl: hasActivePrompt
          ? `/generating?promptId=${row.latest_prompt_id}&sceneId=${row.scene_id}`
          : `/create?attemptId=${row.attempt_id}&sceneId=${row.scene_id}`
      };
    });

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
