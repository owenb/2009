import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface ViewRequestBody {
  sessionId: string;
  viewerAddress?: string;
  viewerFid?: number;
  referrerSceneId?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId: sceneIdParam } = await params;

    // Parse scene ID
    const sceneId = parseInt(sceneIdParam, 10);

    if (isNaN(sceneId)) {
      return NextResponse.json(
        { error: 'Invalid scene ID' },
        { status: 400 }
      );
    }

    // Parse request body
    const body: ViewRequestBody = await request.json();
    const { sessionId, viewerAddress, viewerFid, referrerSceneId } = body;

    // Validate session ID is provided
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Verify scene exists
    const sceneCheck = await query(
      'SELECT id FROM scenes WHERE id = $1',
      [sceneId]
    );

    if (sceneCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Scene not found' },
        { status: 404 }
      );
    }

    // Record the view event
    await query(
      `INSERT INTO scene_views
       (scene_id, viewer_address, viewer_fid, session_id, referrer_scene_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        sceneId,
        viewerAddress || null,
        viewerFid || null,
        sessionId,
        referrerSceneId || null
      ]
    );

    // Increment aggregate view count on scenes table
    await query(
      `UPDATE scenes
       SET view_count = COALESCE(view_count, 0) + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [sceneId]
    );

    return NextResponse.json({
      success: true,
      sceneId,
      sessionId
    });

  } catch (error) {
    console.error('Error recording scene view:', error);
    return NextResponse.json(
      { error: 'Failed to record view' },
      { status: 500 }
    );
  }
}
