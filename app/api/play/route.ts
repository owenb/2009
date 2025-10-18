import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSignedVideoUrl } from '@/lib/r2';

interface PlaySceneRequest {
  parentSceneId: number | 'genesis';
  slot: 'A' | 'B' | 'C';
}

interface SceneWithCreator {
  id: number;
  parent_id: number;
  slot: string;
  slot_label: string | null;
  status: string;
  creator_address: string | null;
  creator_fid: number | null;
  created_at: Date;
  current_attempt_id: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const body: PlaySceneRequest = await request.json();
    const { parentSceneId, slot } = body;

    if (!slot || !['A', 'B', 'C'].includes(slot)) {
      return NextResponse.json(
        { error: 'Invalid slot. Must be A, B, or C' },
        { status: 400 }
      );
    }

    // Handle "genesis" as scene ID 1
    const parentId = parentSceneId === 'genesis' ? 1 : parentSceneId;

    if (typeof parentId !== 'number' || isNaN(parentId)) {
      return NextResponse.json(
        { error: 'Invalid parent scene ID' },
        { status: 400 }
      );
    }

    // Query the scene that matches parent_id and slot
    const result = await query<SceneWithCreator>(
      `SELECT id, parent_id, slot, slot_label, status, creator_address,
              creator_fid, created_at, current_attempt_id
       FROM scenes
       WHERE parent_id = $1 AND slot = $2`,
      [parentId, slot]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Scene not found' },
        { status: 404 }
      );
    }

    const scene = result.rows[0];

    // Verify the scene is completed (has a video)
    if (scene.status !== 'completed') {
      return NextResponse.json(
        { error: 'Scene is not yet completed' },
        { status: 400 }
      );
    }

    // Generate signed URL for the video (scene ID = scene.id, e.g., 2.mp4)
    const videoUrl = await getSignedVideoUrl(scene.id, 3600); // 1 hour expiration

    // Return scene metadata + signed video URL
    return NextResponse.json({
      sceneId: scene.id,
      videoUrl,
      slotLabel: scene.slot_label,
      creatorAddress: scene.creator_address,
      creatorFid: scene.creator_fid,
      createdAt: scene.created_at,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

  } catch (error) {
    console.error('Error in /api/play:', error);
    return NextResponse.json(
      { error: 'Failed to load scene' },
      { status: 500 }
    );
  }
}
