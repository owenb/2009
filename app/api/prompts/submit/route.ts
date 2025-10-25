/**
 * Prompt Submission API
 * POST /api/prompts/submit
 *
 * Submits final prompt and triggers Sora 2 video generation
 * Supports last frame extraction for continuity
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { generateVideo } from '@/lib/sora';
import { resizeImageForVideo } from '@/lib/image-processing';

// NOTE: This endpoint now accepts FormData to support file uploads
// Parameters:
// - attemptId: number
// - promptText: string
// - refinedPromptText?: string
// - inputFrame?: File (optional last frame for continuity)

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
    // Parse request body - support both JSON and FormData
    const contentType = request.headers.get('content-type') || '';
    let attemptId: number;
    let promptText: string;
    let refinedPromptText: string | null = null;
    let inputFrame: File | null = null;

    try {
      if (contentType.includes('application/json')) {
        // Parse as JSON
        const body = await request.json();
        attemptId = parseInt(body.attemptId);
        promptText = body.promptText;
        refinedPromptText = body.refinedPromptText || null;
        // Note: JSON requests cannot include files, inputFrame remains null
      } else {
        // Parse as FormData (supports file uploads)
        const formData = await request.formData();
        attemptId = parseInt(formData.get('attemptId') as string);
        promptText = formData.get('promptText') as string;
        refinedPromptText = formData.get('refinedPromptText') as string | null;
        inputFrame = formData.get('inputFrame') as File | null;
      }
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return NextResponse.json(
        {
          error: 'Invalid request format',
          details: 'Request body must be either JSON or FormData',
          contentType
        },
        { status: 400 }
      );
    }

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

    // Process input frame if provided (for continuity)
    let processedFrame: File | undefined;
    if (inputFrame) {
      try {
        console.log('📸 Processing input frame for continuity...');
        const resizeResult = await resizeImageForVideo(inputFrame, '1024x1792'); // Sora 2 Pro portrait size

        // Convert buffer back to File for Sora
        const blob = new Blob([resizeResult.resizedBuffer], { type: 'image/jpeg' });
        processedFrame = new File([blob], 'last-frame.jpg', { type: 'image/jpeg' });

        console.log('✅ Frame processed:', {
          originalSize: `${resizeResult.originalWidth}x${resizeResult.originalHeight}`,
          resizedSize: `${resizeResult.resizedWidth}x${resizeResult.resizedHeight}`,
          wasResized: resizeResult.wasResized
        });
      } catch (error) {
        console.error('❌ Failed to process input frame:', error);
        // Continue without frame - don't fail the whole request
      }
    }

    // Start Sora 2 video generation using new SDK
    let videoJobId: string;
    let generationStatus: string;

    try {
      console.log('🎬 Starting Sora 2 video generation...');
      console.log('Prompt:', finalPrompt.substring(0, 200) + '...');
      console.log('Has input frame:', !!processedFrame);

      // Call Sora 2 Pro API (matching video-admin setup)
      const result = await generateVideo({
        prompt: finalPrompt,
        model: 'sora-2-pro',
        aspectRatio: '9:21', // Maps to 1024x1792 (Pro portrait)
        duration: 12,
        inputImage: processedFrame,
      });

      if (result.status === 'failed') {
        console.error('Sora 2 generation failed:', result.error);

        // Update prompt outcome based on error type
        let outcome = 'api_error';
        if (result.error?.code === 'content_policy_violation') {
          outcome = 'moderation_rejected';
        } else if (result.error?.code === 'rate_limit_exceeded') {
          outcome = 'rate_limited';
        }

        await query(`
          UPDATE prompts
          SET
            outcome = $1,
            error_message = $2
          WHERE id = $3
        `, [outcome, result.error?.message || 'Unknown error', promptRow.id]);

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
            details: result.error?.message || 'Unknown error',
            canRetry: true,
            promptId: promptRow.id
          },
          { status: 400 }
        );
      }

      videoJobId = result.id;
      generationStatus = result.status;

      console.log('✅ Sora 2 job created:', { videoJobId, status: generationStatus });

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
