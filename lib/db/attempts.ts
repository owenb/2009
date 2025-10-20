/**
 * Database helper functions for scene generation attempts and prompts
 * Tracks the lifecycle of scene generation (payment → prompts → completion)
 */

import { query } from '@/lib/db';
import type {
  SceneGenerationAttempt,
  CreateAttemptInput,
  UpdateAttemptInput,
  Prompt,
  CreatePromptInput,
  UpdatePromptInput,
} from './types';

// ============================================================================
// SCENE GENERATION ATTEMPTS
// ============================================================================

/**
 * Get an attempt by ID
 */
export async function getAttemptById(attemptId: number): Promise<SceneGenerationAttempt | null> {
  const result = await query<SceneGenerationAttempt>(
    `SELECT * FROM scene_generation_attempts WHERE id = $1 LIMIT 1`,
    [attemptId]
  );

  return result.rows[0] || null;
}

/**
 * Get all attempts for a scene (including failed ones)
 */
export async function getAttemptsByScene(sceneId: number): Promise<SceneGenerationAttempt[]> {
  const result = await query<SceneGenerationAttempt>(
    `SELECT * FROM scene_generation_attempts
     WHERE scene_id = $1
     ORDER BY created_at DESC`,
    [sceneId]
  );

  return result.rows;
}

/**
 * Get active attempts for a user
 */
export async function getActiveAttemptsByUser(
  userAddress: string
): Promise<SceneGenerationAttempt[]> {
  const result = await query<SceneGenerationAttempt>(
    `SELECT * FROM scene_generation_attempts
     WHERE creator_address = $1
       AND outcome = 'in_progress'
       AND retry_window_expires_at > NOW()
     ORDER BY created_at DESC`,
    [userAddress]
  );

  return result.rows;
}

/**
 * Create a new generation attempt (after payment verified)
 */
export async function createAttempt(input: CreateAttemptInput): Promise<SceneGenerationAttempt> {
  const result = await query<SceneGenerationAttempt>(
    `INSERT INTO scene_generation_attempts (
      scene_id,
      creator_address,
      creator_fid,
      transaction_hash,
      payment_confirmed_at,
      retry_window_expires_at,
      outcome
    ) VALUES ($1, $2, $3, $4, $5, $6, 'in_progress')
    RETURNING *`,
    [
      input.scene_id,
      input.creator_address,
      input.creator_fid || null,
      input.transaction_hash,
      input.payment_confirmed_at,
      input.retry_window_expires_at,
    ]
  );

  return result.rows[0];
}

/**
 * Update an attempt's status
 */
export async function updateAttempt(
  attemptId: number,
  updates: UpdateAttemptInput
): Promise<SceneGenerationAttempt | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let paramCount = 1;

  if (updates.outcome !== undefined) {
    fields.push(`outcome = $${paramCount++}`);
    params.push(updates.outcome);
  }

  if (updates.retry_window_expires_at !== undefined) {
    fields.push(`retry_window_expires_at = $${paramCount++}`);
    params.push(updates.retry_window_expires_at);
  }

  if (fields.length === 0) {
    return getAttemptById(attemptId);
  }

  fields.push(`updated_at = NOW()`);
  params.push(attemptId);

  const result = await query<SceneGenerationAttempt>(
    `UPDATE scene_generation_attempts
     SET ${fields.join(', ')}
     WHERE id = $${paramCount}
     RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

/**
 * Mark an attempt as succeeded
 */
export async function succeedAttempt(attemptId: number): Promise<SceneGenerationAttempt | null> {
  return updateAttempt(attemptId, { outcome: 'succeeded' });
}

/**
 * Mark an attempt as failed (retry window expired)
 */
export async function failAttempt(attemptId: number): Promise<SceneGenerationAttempt | null> {
  return updateAttempt(attemptId, { outcome: 'failed' });
}

/**
 * Mark an attempt as abandoned (user gave up)
 */
export async function abandonAttempt(attemptId: number): Promise<SceneGenerationAttempt | null> {
  return updateAttempt(attemptId, { outcome: 'abandoned' });
}

/**
 * Check if an attempt's retry window has expired
 */
export async function isAttemptExpired(attemptId: number): Promise<boolean> {
  const result = await query<{ expired: boolean }>(
    `SELECT (retry_window_expires_at < NOW()) as expired
     FROM scene_generation_attempts
     WHERE id = $1`,
    [attemptId]
  );

  return result.rows[0]?.expired || false;
}

// ============================================================================
// PROMPTS
// ============================================================================

/**
 * Get a prompt by ID
 */
export async function getPromptById(promptId: number): Promise<Prompt | null> {
  const result = await query<Prompt>(
    `SELECT * FROM prompts WHERE id = $1 LIMIT 1`,
    [promptId]
  );

  return result.rows[0] || null;
}

/**
 * Get all prompts for an attempt
 */
export async function getPromptsByAttempt(attemptId: number): Promise<Prompt[]> {
  const result = await query<Prompt>(
    `SELECT * FROM prompts
     WHERE attempt_id = $1
     ORDER BY submitted_at ASC`,
    [attemptId]
  );

  return result.rows;
}

/**
 * Get the latest prompt for an attempt
 */
export async function getLatestPrompt(attemptId: number): Promise<Prompt | null> {
  const result = await query<Prompt>(
    `SELECT * FROM prompts
     WHERE attempt_id = $1
     ORDER BY submitted_at DESC
     LIMIT 1`,
    [attemptId]
  );

  return result.rows[0] || null;
}

/**
 * Create a new prompt submission
 */
export async function createPrompt(input: CreatePromptInput): Promise<Prompt> {
  const result = await query<Prompt>(
    `INSERT INTO prompts (
      attempt_id,
      prompt_text,
      refined_prompt_text,
      video_job_id,
      outcome
    ) VALUES ($1, $2, $3, $4, 'pending')
    RETURNING *`,
    [
      input.attempt_id,
      input.prompt_text,
      input.refined_prompt_text || null,
      input.video_job_id || null,
    ]
  );

  return result.rows[0];
}

/**
 * Update a prompt's status or job info
 */
export async function updatePrompt(
  promptId: number,
  updates: UpdatePromptInput
): Promise<Prompt | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let paramCount = 1;

  if (updates.outcome !== undefined) {
    fields.push(`outcome = $${paramCount++}`);
    params.push(updates.outcome);
  }

  if (updates.video_job_id !== undefined) {
    fields.push(`video_job_id = $${paramCount++}`);
    params.push(updates.video_job_id);
  }

  if (updates.error_message !== undefined) {
    fields.push(`error_message = $${paramCount++}`);
    params.push(updates.error_message);
  }

  if (updates.last_polled_at !== undefined) {
    fields.push(`last_polled_at = $${paramCount++}`);
    params.push(updates.last_polled_at);
  }

  if (updates.completed_at !== undefined) {
    fields.push(`completed_at = $${paramCount++}`);
    params.push(updates.completed_at);
  }

  if (fields.length === 0) {
    return getPromptById(promptId);
  }

  params.push(promptId);

  const result = await query<Prompt>(
    `UPDATE prompts
     SET ${fields.join(', ')}
     WHERE id = $${paramCount}
     RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

/**
 * Mark a prompt as generating with job ID
 */
export async function startPromptGeneration(
  promptId: number,
  videoJobId: string
): Promise<Prompt | null> {
  return updatePrompt(promptId, {
    outcome: 'generating',
    video_job_id: videoJobId,
    last_polled_at: new Date(),
  });
}

/**
 * Mark a prompt as successfully completed
 */
export async function completePrompt(promptId: number): Promise<Prompt | null> {
  return updatePrompt(promptId, {
    outcome: 'success',
    completed_at: new Date(),
  });
}

/**
 * Mark a prompt as rejected by moderation
 */
export async function rejectPrompt(
  promptId: number,
  errorMessage: string
): Promise<Prompt | null> {
  return updatePrompt(promptId, {
    outcome: 'moderation_rejected',
    error_message: errorMessage,
  });
}

/**
 * Mark a prompt as rate limited
 */
export async function rateLimitPrompt(promptId: number): Promise<Prompt | null> {
  return updatePrompt(promptId, { outcome: 'rate_limited' });
}

/**
 * Mark a prompt as failed due to API error
 */
export async function failPrompt(promptId: number, errorMessage: string): Promise<Prompt | null> {
  return updatePrompt(promptId, {
    outcome: 'api_error',
    error_message: errorMessage,
  });
}

/**
 * Update polling timestamp for a generating prompt
 */
export async function updatePromptPoll(promptId: number): Promise<Prompt | null> {
  return updatePrompt(promptId, { last_polled_at: new Date() });
}

/**
 * Get all prompts that are currently generating (for polling job)
 */
export async function getGeneratingPrompts(): Promise<Prompt[]> {
  const result = await query<Prompt>(
    `SELECT * FROM prompts
     WHERE outcome = 'generating'
       AND video_job_id IS NOT NULL
     ORDER BY last_polled_at ASC NULLS FIRST`,
    []
  );

  return result.rows;
}
