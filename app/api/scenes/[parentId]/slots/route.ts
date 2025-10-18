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
}

export async function GET(
  request: NextRequest,
  { params }: { params: { parentId: string } }
) {
  try {
    const { parentId: parentIdParam } = params;

    // Handle "genesis" or "null" as the intro scene (id=1)
    const parentId = parentIdParam === 'genesis' || parentIdParam === 'null'
      ? 1
      : parseInt(parentIdParam, 10);

    if (isNaN(parentId)) {
      return NextResponse.json(
        { error: 'Invalid parent ID' },
        { status: 400 }
      );
    }

    // Query all slots for this parent scene
    const result = await query<Scene>(
      `SELECT id, parent_id, slot, slot_label, status, creator_address,
              locked_until, locked_by_address
       FROM scenes
       WHERE parent_id = $1
       ORDER BY slot`,
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
        };
      }

      // Check if slot is currently locked
      const isLocked = scene.locked_until && new Date(scene.locked_until) > new Date();

      return {
        slot: slotLetter as 'A' | 'B' | 'C',
        exists: true,
        sceneId: scene.id,
        label: scene.slot_label,
        status: scene.status,
        isLocked,
        lockedBy: isLocked ? scene.locked_by_address : null,
        lockedUntil: isLocked ? scene.locked_until : null,
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
