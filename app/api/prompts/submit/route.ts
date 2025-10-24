/**
 * Prompt Submission API
 * POST /api/prompts/submit
 *
 * Submits final prompt and triggers Sora 2 video generation
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface SubmitRequest {
  attemptId: number;
  promptText: string;
  refinedPromptText?: string;
}

interface AttemptRow {
  id: number;
  scene_id: number;
  outcome: string;
  retry_window_expires_at: Date;
}

interface PromptInsertRow {
  id: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: SubmitRequest = await request.json();
    const { attemptId, promptText, refinedPromptText } = body;

    // Validate inputs
    if (!attemptId || isNaN(attemptId)) {
      return NextResponse.json(
        { error: 'Invalid attempt ID' },
        { status: 400 }
      );
    }

    if (!promptText || promptText.trim().length === 0) {
      return NextResponse.json(
        { error: 'Prompt text is required' },
        { status: 400 }
      );
    }

    // Verify attempt exists and is still valid
    const attemptResult = await query<AttemptRow>(`
      SELECT sga.id, sga.scene_id, sga.outcome, sga.retry_window_expires_at, s.status as scene_status
      FROM scene_generation_attempts sga
      JOIN scenes s ON sga.scene_id = s.id
      WHERE sga.id = $1
    `, [attemptId]);

    if (attemptResult.rowCount === 0) {
      return NextResponse.json(
        { error: 'Generation attempt not found' },
        { status: 404 }
      );
    }

    const attempt = attemptResult.rows[0] as AttemptRow & { scene_status: string };

    // Check if attempt is still in progress
    if (attempt.outcome !== 'in_progress') {
      return NextResponse.json(
        { error: `Attempt is ${attempt.outcome}. Cannot submit prompts.` },
        { status: 400 }
      );
    }

    // Check if retry window has expired
    const now = new Date();
    const expiresAt = new Date(attempt.retry_window_expires_at);

    if (now > expiresAt) {
      // Mark attempt as failed
      await query(`
        UPDATE scene_generation_attempts
        SET outcome = 'failed', updated_at = NOW()
        WHERE id = $1
      `, [attemptId]);

      await query(`
        UPDATE scenes
        SET status = 'failed', updated_at = NOW()
        WHERE id = $1
      `, [attempt.scene_id]);

      return NextResponse.json(
        { error: 'Retry window has expired' },
        { status: 400 }
      );
    }

    // Check prompt limit (max 3 attempts per scene generation)
    const promptCountResult = await query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM prompts
      WHERE attempt_id = $1
    `, [attemptId]);

    const promptCount = parseInt(promptCountResult.rows[0].count);

    if (promptCount >= 3) {
      return NextResponse.json(
        {
          error: 'Maximum prompt limit reached',
          message: 'You have used all 3 prompt attempts. Please confirm your best scene or request a refund.',
          promptsUsed: promptCount,
          maxPrompts: 3
        },
        { status: 400 }
      );
    }

    // Determine which prompt to use (prefer refined if available)
    const finalPrompt = refinedPromptText || promptText;

    // Create prompts table row
    const promptResult = await query<PromptInsertRow>(`
      INSERT INTO prompts (
        attempt_id,
        prompt_text,
        refined_prompt_text,
        outcome,
        submitted_at
      )
      VALUES ($1, $2, $3, 'pending', NOW())
      RETURNING id
    `, [attemptId, promptText, refinedPromptText || null]);

    const promptRow = promptResult.rows[0];

    // Update scene status to generating
    await query(`
      UPDATE scenes
      SET status = 'generating', updated_at = NOW()
      WHERE id = $1
    `, [attempt.scene_id]);

    // Start Sora 2 video generation (asynchronously)
    let videoJobId: string;
    let generationStatus: string;

    try {
      console.log('Starting Sora 2 video generation...');
      console.log('Prompt:', finalPrompt);

      // Call Sora 2 API (this only creates the job, doesn't wait for completion)
      const response = await fetch('https://api.openai.com/v1/videos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sora-2', // Standard model for 8-second videos
          prompt: finalPrompt,
          size: '720x1280', // 9:16 portrait for mobile
          seconds: '8' // Fixed 8 seconds per scene
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Sora 2 API error:', error);

        // Update prompt outcome based on error type
        let outcome = 'api_error';
        if (error.error?.code === 'content_policy_violation' || error.error?.type === 'content_policy_violation') {
          outcome = 'moderation_rejected';
        } else if (error.error?.code === 'rate_limit_exceeded') {
          outcome = 'rate_limited';
        }

        await query(`
          UPDATE prompts
          SET
            outcome = $1,
            error_message = $2
          WHERE id = $3
        `, [outcome, error.error?.message || 'Unknown error', promptRow.id]);

        // Update scene back to awaiting_prompt for retry
        await query(`
          UPDATE scenes
          SET status = 'awaiting_prompt', updated_at = NOW()
          WHERE id = $1
        `, [attempt.scene_id]);

        return NextResponse.json(
          {
            error: 'Video generation failed',
            errorType: outcome,
            details: error.error?.message || 'Unknown error',
            canRetry: true,
            promptId: promptRow.id
          },
          { status: 400 }
        );
      }

      const videoJob = await response.json();
      videoJobId = videoJob.id;
      generationStatus = videoJob.status || 'queued';

      console.log('Sora 2 job created:', { videoJobId, status: generationStatus });

      // Update prompt with video job ID
      await query(`
        UPDATE prompts
        SET
          video_job_id = $1,
          outcome = 'generating'
        WHERE id = $2
      `, [videoJobId, promptRow.id]);

      // Also update scene with video_job_id for easy tracking
      await query(`
        UPDATE scenes
        SET video_job_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [videoJobId, attempt.scene_id]);

    } catch (error) {
      console.error('Error starting video generation:', error);

      // Update prompt outcome
      await query(`
        UPDATE prompts
        SET
          outcome = 'api_error',
          error_message = $1
        WHERE id = $2
      `, [(error as Error).message, promptRow.id]);

      // Update scene back to awaiting_prompt
      await query(`
        UPDATE scenes
        SET status = 'awaiting_prompt', updated_at = NOW()
        WHERE id = $1
      `, [attempt.scene_id]);

      return NextResponse.json(
        {
          error: 'Failed to start video generation',
          details: (error as Error).message,
          canRetry: true,
          promptId: promptRow.id
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      promptId: promptRow.id,
      videoJobId,
      status: generationStatus,
      attemptId,
      sceneId: attempt.scene_id,
      retryWindowExpires: attempt.retry_window_expires_at
    });

  } catch (error) {
    console.error('Error in prompt submission:', error);
    return NextResponse.json(
      {
        error: 'Failed to submit prompt',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
