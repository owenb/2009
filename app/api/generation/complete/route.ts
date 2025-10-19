/**
 * Generation Completion API
 * POST /api/generation/complete
 *
 * Downloads video from Sora, uploads to R2, and finalizes scene
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { downloadSoraVideo } from '@/lib/sora';
import { uploadVideoToR2 } from '@/lib/r2';
import { generateSlotLabel } from '@/lib/generateSlotLabel';

interface CompleteRequest {
  promptId: number;
  videoJobId: string;
}

interface PromptRow {
  id: number;
  attempt_id: number;
  video_job_id: string;
  outcome: string;
  refined_prompt_text: string | null;
  prompt_text: string;
  scene_id: number;
  creator_address: string;
  creator_fid: number | null;
  parent_id: number;
  slot: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: CompleteRequest = await request.json();
    const { promptId, videoJobId } = body;

    // Validate inputs
    if (!promptId || isNaN(promptId)) {
      return NextResponse.json(
        { error: 'Invalid prompt ID' },
        { status: 400 }
      );
    }

    if (!videoJobId || typeof videoJobId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid video job ID' },
        { status: 400 }
      );
    }

    // Fetch prompt and related data
    const promptResult = await query<PromptRow>(`
      SELECT
        p.id,
        p.attempt_id,
        p.video_job_id,
        p.outcome,
        p.refined_prompt_text,
        p.prompt_text,
        a.scene_id,
        a.creator_address,
        a.creator_fid,
        s.parent_id,
        s.slot
      FROM prompts p
      JOIN scene_generation_attempts a ON p.attempt_id = a.id
      JOIN scenes s ON a.scene_id = s.id
      WHERE p.id = $1
    `, [promptId]);

    if (promptResult.rowCount === 0) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      );
    }

    const promptRow = promptResult.rows[0];

    // Verify video_job_id matches
    if (promptRow.video_job_id !== videoJobId) {
      return NextResponse.json(
        { error: 'Video job ID mismatch' },
        { status: 400 }
      );
    }

    // Check if already completed
    if (promptRow.outcome === 'success') {
      return NextResponse.json({
        success: true,
        message: 'Video already completed',
        sceneId: promptRow.scene_id
      });
    }

    const sceneId = promptRow.scene_id;

    console.log(`Completing video generation for scene ${sceneId}, job ${videoJobId}`);

    // Step 1: Download video from Sora
    let videoBlob: Blob;
    const downloadUrl = `https://api.openai.com/v1/videos/${videoJobId}/content`;

    try {
      console.log('Downloading video from Sora...');
      videoBlob = await downloadSoraVideo(downloadUrl);
      console.log(`Video downloaded: ${videoBlob.size} bytes`);
    } catch (error) {
      console.error('Failed to download video:', error);
      return NextResponse.json(
        {
          error: 'Failed to download video from Sora',
          details: (error as Error).message
        },
        { status: 500 }
      );
    }

    // Step 2: Upload to R2
    let r2Url: string;

    try {
      console.log('Uploading video to R2...');
      r2Url = await uploadVideoToR2(sceneId, videoBlob);
      console.log(`Video uploaded to R2: ${r2Url}`);
    } catch (error) {
      console.error('Failed to upload to R2:', error);
      return NextResponse.json(
        {
          error: 'Failed to upload video to storage',
          details: (error as Error).message
        },
        { status: 500 }
      );
    }

    // Step 3: Generate slot label from refined prompt
    let slotLabel: string;

    try {
      console.log('Generating slot label...');
      const promptForLabel = promptRow.refined_prompt_text || promptRow.prompt_text;
      slotLabel = await generateSlotLabel(promptForLabel);
      console.log(`Slot label generated: "${slotLabel}"`);
    } catch (error) {
      console.error('Failed to generate slot label:', error);
      // Use fallback label
      slotLabel = 'new scene';
    }

    // Step 4: Update database - mark everything as complete
    try {
      // Update prompts table
      await query(`
        UPDATE prompts
        SET
          outcome = 'success',
          completed_at = NOW()
        WHERE id = $1
      `, [promptId]);

      // Update scene_generation_attempts table
      await query(`
        UPDATE scene_generation_attempts
        SET
          outcome = 'succeeded',
          updated_at = NOW()
        WHERE id = $1
      `, [promptRow.attempt_id]);

      // Update scenes table - THIS IS THE BIG ONE
      await query(`
        UPDATE scenes
        SET
          status = 'completed',
          creator_address = $1,
          creator_fid = $2,
          current_attempt_id = $3,
          slot_label = $4,
          updated_at = NOW()
        WHERE id = $5
      `, [
        promptRow.creator_address,
        promptRow.creator_fid,
        promptRow.attempt_id,
        slotLabel,
        sceneId
      ]);

      console.log(`Scene ${sceneId} completed successfully!`);

    } catch (error) {
      console.error('Failed to update database:', error);
      return NextResponse.json(
        {
          error: 'Failed to finalize scene',
          details: (error as Error).message
        },
        { status: 500 }
      );
    }

    // Success!
    return NextResponse.json({
      success: true,
      sceneId,
      videoUrl: r2Url,
      slotLabel,
      parentId: promptRow.parent_id,
      slot: promptRow.slot,
      message: 'Video generation completed successfully'
    });

  } catch (error) {
    console.error('Error in generation completion:', error);
    return NextResponse.json(
      {
        error: 'Failed to complete video generation',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
