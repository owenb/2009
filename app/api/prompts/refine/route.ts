/**
 * Prompt Refinement API
 * POST /api/prompts/refine
 *
 * Uses GPT-4o-mini to refine user prompts for Sora 2 video generation
 * with story context to ensure narrative continuity
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getStoryContext, formatStoryContextForGPT } from '@/lib/getStoryContext';
import { refinePrompt } from '@/lib/sora';

interface RefineRequest {
  attemptId: number;
  promptText: string;
}

interface AttemptRow {
  id: number;
  scene_id: number;
  outcome: string;
  retry_window_expires_at: Date;
}

export async function POST(request: NextRequest) {
  try {
    const body: RefineRequest = await request.json();
    const { attemptId, promptText } = body;

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

    if (promptText.trim().length > 1000) {
      return NextResponse.json(
        { error: 'Prompt is too long (max 1000 characters)' },
        { status: 400 }
      );
    }

    // Verify attempt exists and is still valid
    const attemptResult = await query<AttemptRow>(`
      SELECT id, scene_id, outcome, retry_window_expires_at
      FROM scene_generation_attempts
      WHERE id = $1
    `, [attemptId]);

    if (attemptResult.rowCount === 0) {
      return NextResponse.json(
        { error: 'Generation attempt not found' },
        { status: 404 }
      );
    }

    const attempt = attemptResult.rows[0];

    // Check if attempt is still in progress
    if (attempt.outcome !== 'in_progress') {
      return NextResponse.json(
        { error: `Attempt is ${attempt.outcome}. Cannot refine prompts.` },
        { status: 400 }
      );
    }

    // Check if retry window has expired
    const now = new Date();
    const expiresAt = new Date(attempt.retry_window_expires_at);

    if (now > expiresAt) {
      return NextResponse.json(
        { error: 'Retry window has expired' },
        { status: 400 }
      );
    }

    // Fetch story context (up to 3 previous prompts)
    console.log(`Fetching story context for scene ${attempt.scene_id}...`);
    const storyContext = await getStoryContext(attempt.scene_id);
    const formattedContext = formatStoryContextForGPT(storyContext);

    console.log(`Story context: ${storyContext.prompts.length} prompts, depth ${storyContext.totalDepth}`);

    // Refine prompt using comprehensive Sora 2 system with story context
    let refinedPrompt: string;
    let suggestions: string[] = [];

    try {
      const refinementResult = await refinePrompt(promptText, {
        movieContext: formattedContext,
        videoDuration: 12, // Fixed 12 seconds per scene with Sora 2 Pro
        method: 'auto', // Let AI choose best prompting method
      });
      refinedPrompt = refinementResult.refined;
      suggestions = refinementResult.suggestions;
    } catch (error) {
      console.error('Error refining prompt:', error);
      return NextResponse.json(
        {
          error: 'Failed to refine prompt',
          details: (error as Error).message
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      originalPrompt: promptText,
      refinedPrompt,
      suggestions,
      attemptId,
      retryWindowExpires: attempt.retry_window_expires_at
    });

  } catch (error) {
    console.error('Error in prompt refinement:', error);
    return NextResponse.json(
      { error: 'Failed to refine prompt' },
      { status: 500 }
    );
  }
}
