/**
 * Database helper functions for scenes
 * All scene-related queries in one place
 */

import { query } from '@/lib/db';
import type {
  Scene,
  SceneWithAttempt,
  CreateSceneInput,
  UpdateSceneInput,
  SlotInfo,
  SceneFilters,
} from './types';

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get a scene by its ID
 */
export async function getSceneById(sceneId: number): Promise<Scene | null> {
  const result = await query<Scene>(
    `SELECT * FROM scenes WHERE id = $1 LIMIT 1`,
    [sceneId]
  );

  return result.rows[0] || null;
}

/**
 * Get a scene with its active attempt and latest prompt info
 * Useful for displaying generation progress
 */
export async function getSceneWithAttempt(sceneId: number): Promise<SceneWithAttempt | null> {
  const result = await query<SceneWithAttempt>(
    `SELECT
      s.*,
      sga.creator_address as attempt_creator_address,
      sga.retry_window_expires_at,
      p.id as latest_prompt_id,
      p.outcome as latest_prompt_outcome
    FROM scenes s
    LEFT JOIN scene_generation_attempts sga ON s.current_attempt_id = sga.id
    LEFT JOIN LATERAL (
      SELECT id, outcome
      FROM prompts
      WHERE attempt_id = sga.id
      ORDER BY submitted_at DESC
      LIMIT 1
    ) p ON sga.id IS NOT NULL
    WHERE s.id = $1
    LIMIT 1`,
    [sceneId]
  );

  return result.rows[0] || null;
}

/**
 * Get all scenes for a movie
 */
export async function getScenesByMovie(
  movieId: number,
  filters: SceneFilters = {}
): Promise<Scene[]> {
  const conditions: string[] = ['s.movie_id = $1'];
  const params: unknown[] = [movieId];
  let paramCount = 2;

  if (filters.status) {
    conditions.push(`s.status = $${paramCount++}`);
    params.push(filters.status);
  }

  if (filters.parent_id !== undefined) {
    conditions.push(`s.parent_id = $${paramCount++}`);
    params.push(filters.parent_id);
  }

  if (filters.creator_address) {
    conditions.push(`s.creator_address = $${paramCount++}`);
    params.push(filters.creator_address);
  }

  const result = await query<Scene>(
    `SELECT s.* FROM scenes s
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.created_at DESC`,
    params
  );

  return result.rows;
}

/**
 * Get all child scenes of a parent scene
 */
export async function getChildScenes(parentId: number): Promise<Scene[]> {
  const result = await query<Scene>(
    `SELECT * FROM scenes
     WHERE parent_id = $1
     ORDER BY slot`,
    [parentId]
  );

  return result.rows;
}

/**
 * Get slot information for a parent scene (UI-friendly format)
 * Returns status for all 3 slots (A, B, C)
 */
export async function getSlotsForScene(parentId: number): Promise<SlotInfo[]> {
  const result = await query<SceneWithAttempt>(
    `SELECT
      s.id,
      s.slot,
      s.slot_label,
      s.status,
      s.locked_until,
      s.locked_by_address,
      s.current_attempt_id,
      sga.creator_address as attempt_creator_address,
      sga.retry_window_expires_at,
      p.id as latest_prompt_id,
      p.outcome as latest_prompt_outcome
    FROM scenes s
    LEFT JOIN scene_generation_attempts sga ON s.current_attempt_id = sga.id
    LEFT JOIN LATERAL (
      SELECT id, outcome
      FROM prompts
      WHERE attempt_id = sga.id
      ORDER BY submitted_at DESC
      LIMIT 1
    ) p ON sga.id IS NOT NULL
    WHERE s.parent_id = $1
    ORDER BY s.slot`,
    [parentId]
  );

  const existingSlots = new Map<string, SceneWithAttempt>();
  for (const scene of result.rows) {
    if (scene.slot) {
      existingSlots.set(scene.slot, scene);
    }
  }

  // Build response for all three slots (A, B, C)
  const slots: SlotInfo[] = ['A', 'B', 'C'].map((slotLetter) => {
    const scene = existingSlots.get(slotLetter);

    if (!scene) {
      // Slot doesn't exist - it's available for claiming
      return {
        slot: slotLetter as 'A' | 'B' | 'C',
        exists: false,
        sceneId: null,
        label: null,
        status: null,
        isLocked: false,
        lockedBy: null,
        lockedUntil: null,
        attemptId: null,
        attemptCreator: null,
        expiresAt: null,
        latestPromptId: null,
        latestPromptOutcome: null,
      };
    }

    // Check if slot is currently locked (1-minute lock before payment)
    const isLocked = !!(scene.locked_until && new Date(scene.locked_until) > new Date());

    // Check if slot has an active attempt (after payment, before completion)
    const hasActiveAttempt = !!(
      scene.current_attempt_id &&
      scene.attempt_creator_address &&
      scene.retry_window_expires_at &&
      new Date(scene.retry_window_expires_at) > new Date()
    );

    return {
      slot: slotLetter as 'A' | 'B' | 'C',
      exists: true,
      sceneId: scene.id,
      label: scene.slot_label,
      status: scene.status,
      isLocked,
      lockedBy: isLocked ? scene.locked_by_address : null,
      lockedUntil: isLocked ? scene.locked_until : null,
      attemptId: hasActiveAttempt ? scene.current_attempt_id : null,
      attemptCreator: hasActiveAttempt ? scene.attempt_creator_address : null,
      expiresAt: hasActiveAttempt ? scene.retry_window_expires_at : null,
      latestPromptId: hasActiveAttempt ? scene.latest_prompt_id : null,
      latestPromptOutcome: hasActiveAttempt ? scene.latest_prompt_outcome : null,
    };
  });

  return slots;
}

/**
 * Get all completed scenes for a movie (for tree visualization)
 */
export async function getCompletedScenes(movieId: number): Promise<Scene[]> {
  const result = await query<Scene>(
    `SELECT * FROM scenes
     WHERE movie_id = $1 AND status = 'completed'
     ORDER BY created_at ASC`,
    [movieId]
  );

  return result.rows;
}

/**
 * Get video URL for a scene
 */
export function getSceneVideoUrl(sceneId: number): string {
  return `https://${process.env.AWS_S3_BUCKET_NAME}.r2.cloudflarestorage.com/${sceneId}.mp4`;
}

/**
 * Get scenes created by a specific user
 */
export async function getScenesByCreator(
  creatorAddress: string,
  movieId?: number
): Promise<Scene[]> {
  const conditions = ['creator_address = $1', 'status = $2'];
  const params: unknown[] = [creatorAddress, 'completed'];

  if (movieId) {
    conditions.push('movie_id = $3');
    params.push(movieId);
  }

  const result = await query<Scene>(
    `SELECT * FROM scenes
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC`,
    params
  );

  return result.rows;
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Create a new scene (usually when acquiring a lock)
 */
export async function createScene(input: CreateSceneInput): Promise<Scene> {
  const result = await query<Scene>(
    `INSERT INTO scenes (
      movie_id,
      parent_id,
      slot,
      locked_until,
      locked_by_address,
      locked_by_fid,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
      input.movie_id,
      input.parent_id,
      input.slot,
      input.locked_until || null,
      input.locked_by_address || null,
      input.locked_by_fid || null,
      input.status || 'locked',
    ]
  );

  return result.rows[0];
}

/**
 * Update scene fields
 */
export async function updateScene(
  sceneId: number,
  updates: UpdateSceneInput
): Promise<Scene | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let paramCount = 1;

  // Build dynamic UPDATE query
  if (updates.status !== undefined) {
    fields.push(`status = $${paramCount++}`);
    params.push(updates.status);
  }

  if (updates.locked_until !== undefined) {
    fields.push(`locked_until = $${paramCount++}`);
    params.push(updates.locked_until);
  }

  if (updates.locked_by_address !== undefined) {
    fields.push(`locked_by_address = $${paramCount++}`);
    params.push(updates.locked_by_address);
  }

  if (updates.locked_by_fid !== undefined) {
    fields.push(`locked_by_fid = $${paramCount++}`);
    params.push(updates.locked_by_fid);
  }

  if (updates.creator_address !== undefined) {
    fields.push(`creator_address = $${paramCount++}`);
    params.push(updates.creator_address);
  }

  if (updates.creator_fid !== undefined) {
    fields.push(`creator_fid = $${paramCount++}`);
    params.push(updates.creator_fid);
  }

  if (updates.current_attempt_id !== undefined) {
    fields.push(`current_attempt_id = $${paramCount++}`);
    params.push(updates.current_attempt_id);
  }

  if (updates.slot_label !== undefined) {
    fields.push(`slot_label = $${paramCount++}`);
    params.push(updates.slot_label);
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

  if (updates.generation_attempts !== undefined) {
    fields.push(`generation_attempts = $${paramCount++}`);
    params.push(updates.generation_attempts);
  }

  if (updates.first_attempt_at !== undefined) {
    fields.push(`first_attempt_at = $${paramCount++}`);
    params.push(updates.first_attempt_at);
  }

  if (fields.length === 0) {
    return getSceneById(sceneId);
  }

  fields.push(`updated_at = NOW()`);
  params.push(sceneId);

  const result = await query<Scene>(
    `UPDATE scenes
     SET ${fields.join(', ')}
     WHERE id = $${paramCount}
     RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

/**
 * Try to acquire a lock on a slot (atomic operation)
 * Returns the scene if lock acquired, null if slot is taken
 */
export async function acquireSlotLock(
  movieId: number,
  parentId: number | null,
  slot: 'A' | 'B' | 'C',
  userAddress: string,
  userFid?: number,
  lockDurationSeconds: number = 60
): Promise<Scene | null> {
  try {
    // Try to insert with unique constraint
    const result = await query<Scene>(
      `INSERT INTO scenes (
        movie_id,
        parent_id,
        slot,
        locked_until,
        locked_by_address,
        locked_by_fid,
        status
      )
      VALUES ($1, $2, $3, NOW() + INTERVAL '${lockDurationSeconds} seconds', $4, $5, 'locked')
      ON CONFLICT (parent_id, slot) DO NOTHING
      RETURNING *`,
      [movieId, parentId, slot, userAddress, userFid || null]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Slot exists, try to take over if lock expired
    const updateResult = await query<Scene>(
      `UPDATE scenes
       SET
         locked_until = NOW() + INTERVAL '${lockDurationSeconds} seconds',
         locked_by_address = $4,
         locked_by_fid = $5,
         status = 'locked',
         updated_at = NOW()
       WHERE parent_id = $1
         AND slot = $2
         AND (locked_until IS NULL OR locked_until < NOW())
         AND status IN ('lock_expired', 'failed')
         AND movie_id = $3
       RETURNING *`,
      [parentId, slot, movieId, userAddress, userFid || null]
    );

    return updateResult.rows[0] || null;
  } catch (error) {
    console.error('Error acquiring slot lock:', error);
    return null;
  }
}

/**
 * Release a lock (user canceled or timeout)
 */
export async function releaseSlotLock(sceneId: number): Promise<void> {
  await query(
    `UPDATE scenes
     SET
       status = 'lock_expired',
       locked_until = NULL,
       locked_by_address = NULL,
       locked_by_fid = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [sceneId]
  );
}

/**
 * Mark scene as completed with creator info
 */
export async function completeScene(
  sceneId: number,
  creatorAddress: string,
  creatorFid: number | undefined,
  attemptId: number,
  slotLabel: string
): Promise<Scene | null> {
  const result = await query<Scene>(
    `UPDATE scenes
     SET
       status = 'completed',
       creator_address = $2,
       creator_fid = $3,
       current_attempt_id = $4,
       slot_label = $5,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [sceneId, creatorAddress, creatorFid || null, attemptId, slotLabel]
  );

  return result.rows[0] || null;
}

/**
 * Increment view count for a scene
 */
export async function incrementSceneViews(sceneId: number, count: number = 1): Promise<void> {
  await query(
    `UPDATE scenes
     SET view_count = view_count + $1
     WHERE id = $2`,
    [count, sceneId]
  );
}

// ============================================================================
// VALIDATION / CHECKS
// ============================================================================

/**
 * Check if a slot is available (not taken and not locked)
 */
export async function isSlotAvailable(
  parentId: number | null,
  slot: 'A' | 'B' | 'C'
): Promise<boolean> {
  const result = await query<{ available: boolean }>(
    `SELECT NOT EXISTS(
      SELECT 1 FROM scenes
      WHERE parent_id = $1
        AND slot = $2
        AND (
          status NOT IN ('lock_expired', 'failed')
          OR (locked_until IS NOT NULL AND locked_until > NOW())
        )
    ) as available`,
    [parentId, slot]
  );

  return result.rows[0]?.available || false;
}

/**
 * Check if user has an active lock or attempt on any scene
 */
export async function getUserActiveScenes(userAddress: string): Promise<Scene[]> {
  const result = await query<Scene>(
    `SELECT DISTINCT s.*
     FROM scenes s
     LEFT JOIN scene_generation_attempts sga ON s.current_attempt_id = sga.id
     WHERE
       (s.locked_by_address = $1 AND s.locked_until > NOW())
       OR (sga.creator_address = $1 AND sga.retry_window_expires_at > NOW())
     ORDER BY s.updated_at DESC`,
    [userAddress]
  );

  return result.rows;
}

/**
 * Get genesis scene for a movie
 */
export async function getGenesisScene(movieId: number): Promise<Scene | null> {
  const result = await query<Scene>(
    `SELECT * FROM scenes
     WHERE movie_id = $1 AND parent_id IS NULL
     LIMIT 1`,
    [movieId]
  );

  return result.rows[0] || null;
}
