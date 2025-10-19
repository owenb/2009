/**
 * Scene Context API
 * GET /api/scenes/[sceneId]/context
 *
 * Returns the parent scene information for context display
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface SceneRow {
  id: number;
  parent_id: number | null;
  slot: string | null;
  status: string;
}

interface ParentSceneRow {
  id: number;
  slot_label: string | null;
}

interface AttemptRow {
  retry_window_expires_at: Date;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;

    // Validate sceneId
    if (!sceneId || isNaN(parseInt(sceneId))) {
      return NextResponse.json(
        { error: 'Invalid scene ID' },
        { status: 400 }
      );
    }

    const sceneIdNum = parseInt(sceneId);

    // Fetch the scene
    const sceneResult = await query<SceneRow>(`
      SELECT id, parent_id, slot, status
      FROM scenes
      WHERE id = $1
    `, [sceneIdNum]);

    if (sceneResult.rowCount === 0) {
      return NextResponse.json(
        { error: 'Scene not found' },
        { status: 404 }
      );
    }

    const scene = sceneResult.rows[0];

    // Get parent scene label if it exists
    let parentLabel = 'the beginning';

    if (scene.parent_id !== null) {
      const parentResult = await query<ParentSceneRow>(`
        SELECT id, slot_label
        FROM scenes
        WHERE id = $1
      `, [scene.parent_id]);

      if (parentResult.rowCount > 0) {
        const parent = parentResult.rows[0];
        parentLabel = parent.slot_label || `scene ${parent.id}`;
      }
    }

    // Get expiration time from the current attempt
    let expiresAt = new Date(Date.now() + 3600000).toISOString(); // Default 1 hour

    const attemptResult = await query<AttemptRow>(`
      SELECT retry_window_expires_at
      FROM scene_generation_attempts
      WHERE scene_id = $1 AND outcome = 'in_progress'
      ORDER BY created_at DESC
      LIMIT 1
    `, [sceneIdNum]);

    if (attemptResult.rowCount > 0) {
      expiresAt = attemptResult.rows[0].retry_window_expires_at.toISOString();
    }

    return NextResponse.json({
      sceneId: sceneIdNum,
      parentId: scene.parent_id,
      parentLabel,
      slot: scene.slot,
      status: scene.status,
      expiresAt
    });

  } catch (error) {
    console.error('Error fetching scene context:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scene context' },
      { status: 500 }
    );
  }
}
