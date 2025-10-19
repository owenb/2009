import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface Scene {
  id: number;
  parent_id: number | null;
  slot: string;
  slot_label: string | null;
  status: string;
  creator_address: string | null;
  locked_until: Date | null;
  locked_by_address: string | null;
  current_attempt_id: number | null;
  attempt_creator_address: string | null;
  retry_window_expires_at: Date | null;
  latest_prompt_id: number | null;
  latest_prompt_outcome: string | null;
}

interface SlotInfo {
  slot: 'A' | 'B' | 'C';
  exists: boolean;
  sceneId: number | null;
  label: string | null;
  status: string | null;
  isLocked: boolean;
  lockedBy: string | null;
  lockedUntil: Date | null;
  attemptId: number | null;
  attemptCreator: string | null;
  expiresAt: Date | null;
  latestPromptId: number | null;
  latestPromptOutcome: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId: sceneIdParam } = await params;

    // Handle "genesis" or "null" as the intro scene (id=0 to match smart contract)
    const parentId = sceneIdParam === 'genesis' || sceneIdParam === 'null'
      ? 0
      : parseInt(sceneIdParam, 10);

    if (isNaN(parentId)) {
      return NextResponse.json(
        { error: 'Invalid scene ID' },
        { status: 400 }
      );
    }

    // Query all slots for this parent scene, including active attempt and prompt info
    const result = await query<Scene>(
      `SELECT
        s.id,
        s.parent_id,
        s.slot,
        s.slot_label,
        s.status,
        s.creator_address,
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

    const existingSlots = new Map<string, Scene>();
    for (const scene of result.rows) {
      existingSlots.set(scene.slot, scene);
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

    return NextResponse.json({
      parentId,
      slots
    });

  } catch (error) {
    console.error('Error fetching slots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch slots' },
      { status: 500 }
    );
  }
}
