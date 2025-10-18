/**
 * Generation Polling API
 * GET /api/generation/poll?promptId=123
 *
 * Polls Sora 2 job status and updates database
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { checkVideoStatus } from '@/lib/sora';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const promptIdParam = searchParams.get('promptId');

    if (!promptIdParam) {
      return NextResponse.json(
        { error: 'promptId parameter is required' },
        { status: 400 }
      );
    }

    const promptId = parseInt(promptIdParam, 10);

    if (isNaN(promptId)) {
      return NextResponse.json(
        { error: 'Invalid promptId' },
        { status: 400 }
      );
    }

    // Fetch prompt from database
    const promptResult = await query(`
      SELECT
        p.id,
        p.attempt_id,
        p.video_job_id,
        p.outcome,
        p.error_message,
        p.submitted_at,
        p.last_polled_at,
        a.scene_id,
        a.retry_window_expires_at
      FROM prompts p
      JOIN scene_generation_attempts a ON p.attempt_id = a.id
      WHERE p.id = $1
    `, [promptId]);

    if (promptResult.rowCount === 0) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      );
    }

    const promptRow = promptResult.rows[0];

    // Check if already completed or failed
    if (promptRow.outcome === 'success') {
      return NextResponse.json({
        status: 'completed',
        promptId,
        videoJobId: promptRow.video_job_id,
        message: 'Video generation completed successfully'
      });
    }

    if (['moderation_rejected', 'rate_limited', 'api_error', 'timeout', 'abandoned'].includes(promptRow.outcome)) {
      return NextResponse.json({
        status: 'failed',
        promptId,
        videoJobId: promptRow.video_job_id,
        outcome: promptRow.outcome,
        error: promptRow.error_message
      });
    }

    // Check if video_job_id exists
    if (!promptRow.video_job_id) {
      return NextResponse.json({
        status: 'pending',
        promptId,
        message: 'Job not yet created'
      });
    }

    // Check retry window
    const now = new Date();
    const expiresAt = new Date(promptRow.retry_window_expires_at);

    if (now > expiresAt) {
      // Retry window expired
      await query(`
        UPDATE prompts
        SET outcome = 'timeout', updated_at = NOW()
        WHERE id = $1
      `, [promptId]);

      await query(`
        UPDATE scene_generation_attempts
        SET outcome = 'failed', updated_at = NOW()
        WHERE id = $1
      `, [promptRow.attempt_id]);

      await query(`
        UPDATE scenes
        SET status = 'failed', updated_at = NOW()
        WHERE id = $1
      `, [promptRow.scene_id]);

      return NextResponse.json({
        status: 'failed',
        promptId,
        outcome: 'timeout',
        error: 'Generation window expired'
      });
    }

    // Poll Sora 2 API for status
    try {
      const videoStatus = await checkVideoStatus(promptRow.video_job_id);

      console.log(`Polled video ${promptRow.video_job_id}:`, videoStatus.status);

      // Update last_polled_at
      await query(`
        UPDATE prompts
        SET last_polled_at = NOW()
        WHERE id = $1
      `, [promptId]);

      // Handle different statuses
      if (videoStatus.status === 'completed') {
        // Video is ready! Return the download URL
        // Note: We don't automatically download/upload here - that's done in the complete endpoint
        return NextResponse.json({
          status: 'completed',
          promptId,
          videoJobId: promptRow.video_job_id,
          downloadUrl: videoStatus.downloadUrl,
          message: 'Video generation completed'
        });
      } else if (videoStatus.status === 'failed') {
        // Video generation failed
        const errorMessage = videoStatus.error?.message || 'Unknown error';

        await query(`
          UPDATE prompts
          SET
            outcome = 'api_error',
            error_message = $1,
            updated_at = NOW()
          WHERE id = $2
        `, [errorMessage, promptId]);

        await query(`
          UPDATE scenes
          SET status = 'awaiting_prompt', updated_at = NOW()
          WHERE id = $1
        `, [promptRow.scene_id]);

        return NextResponse.json({
          status: 'failed',
          promptId,
          videoJobId: promptRow.video_job_id,
          outcome: 'api_error',
          error: errorMessage,
          canRetry: true
        });
      } else {
        // Still queued or in_progress
        return NextResponse.json({
          status: videoStatus.status, // 'queued' or 'in_progress'
          promptId,
          videoJobId: promptRow.video_job_id,
          message: videoStatus.status === 'queued' ? 'In queue...' : 'Generating video...'
        });
      }

    } catch (error) {
      console.error('Error polling Sora status:', error);

      // Don't mark as failed yet - might be temporary network issue
      return NextResponse.json({
        status: 'generating',
        promptId,
        videoJobId: promptRow.video_job_id,
        message: 'Polling temporarily unavailable, retrying...'
      });
    }

  } catch (error) {
    console.error('Error in generation polling:', error);
    return NextResponse.json(
      {
        error: 'Failed to poll generation status',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
