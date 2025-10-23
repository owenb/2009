/**
 * Active Generation API
 * GET /api/user/active-generation?address=0x...
 *
 * Returns the single most recent active generation for global notification bar.
 * Includes movie context (slug, title) for navigation and display.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface ActiveGenerationRow {
  attempt_id: number;
  scene_id: number;
  movie_id: number;
  movie_slug: string;
  movie_title: string;
  prompt_id: number;
  prompt_outcome: string;
  retry_window_expires_at: Date;
  video_job_id: string | null;
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

    // Query for the single most recent in-progress OR recently succeeded generation
    // Include movie context for navigation and display
    // Note: We include succeeded attempts from the last 10 seconds to show "Complete!" message
    const result = await query<ActiveGenerationRow>(`
      SELECT
        sga.id as attempt_id,
        sga.scene_id,
        s.movie_id,
        m.slug as movie_slug,
        m.title as movie_title,
        p.id as prompt_id,
        p.outcome as prompt_outcome,
        p.video_job_id,
        sga.retry_window_expires_at
      FROM scene_generation_attempts sga
      JOIN prompts p ON p.attempt_id = sga.id
      JOIN scenes s ON s.id = sga.scene_id
      JOIN movies m ON m.id = s.movie_id
      WHERE sga.creator_address = $1
        AND (
          -- In-progress attempts
          (sga.outcome = 'in_progress' AND sga.retry_window_expires_at > NOW() AND p.outcome IN ('pending', 'generating'))
          OR
          -- Recently succeeded attempts (last 10 seconds) for "Complete!" message
          (sga.outcome = 'succeeded' AND p.outcome = 'success' AND p.completed_at > NOW() - INTERVAL '10 seconds')
        )
      ORDER BY p.submitted_at DESC
      LIMIT 1
    `, [userAddress.toLowerCase()]);

    if (result.rows.length === 0) {
      return NextResponse.json({
        hasActiveGeneration: false,
        generation: null
      });
    }

    const row = result.rows[0];

    // Calculate progress based on status
    // This is a simplified progress calculation - you may want to enhance this
    let progress = 0;
    let status: 'queued' | 'in_progress' | 'completed' = 'queued';

    if (row.prompt_outcome === 'success') {
      progress = 100;
      status = 'completed';
    } else if (row.prompt_outcome === 'pending') {
      progress = 10;
      status = 'queued';
    } else if (row.prompt_outcome === 'generating') {
      // If we have a video_job_id, we're actively generating
      progress = row.video_job_id ? 50 : 30;
      status = 'in_progress';
    }

    // Calculate time remaining in retry window
    const expiresAt = new Date(row.retry_window_expires_at).toISOString();
    const timeRemainingMs = new Date(row.retry_window_expires_at).getTime() - Date.now();

    return NextResponse.json({
      hasActiveGeneration: true,
      generation: {
        attemptId: row.attempt_id,
        sceneId: row.scene_id,
        movieSlug: row.movie_slug,
        movieTitle: row.movie_title,
        status,
        progress,
        expiresAt,
        promptId: row.prompt_id,
        timeRemainingMs
      }
    });

  } catch (error) {
    console.error('Error fetching active generation:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch active generation',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
