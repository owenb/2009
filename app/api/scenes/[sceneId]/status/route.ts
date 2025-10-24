/**
 * Scene Status Check API
 * GET /api/scenes/[sceneId]/status
 *
 * Returns scene status including video URL for awaiting_confirmation scenes
 * Used by generating page to resume confirmation flow if user navigates away
 */

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSignedVideoUrl } from "@/lib/r2";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;
    const sceneIdNum = parseInt(sceneId, 10);

    if (isNaN(sceneIdNum)) {
      return NextResponse.json(
        { error: 'Invalid scene ID' },
        { status: 400 }
      );
    }

    // Fetch scene with all details (including awaiting_confirmation)
    const result = await query(`
      SELECT
        s.id,
        s.status,
        s.metadata_uri,
        s.slot_label,
        s.creator_address,
        s.creator_fid,
        s.created_at,
        m.slug as movie_slug
      FROM scenes s
      JOIN movies m ON s.movie_id = m.id
      WHERE s.id = $1
    `, [sceneIdNum]);

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'Scene not found' },
        { status: 404 }
      );
    }

    const scene = result.rows[0] as {
      id: number;
      status: string;
      metadata_uri: string | null;
      slot_label: string;
      creator_address: string | null;
      creator_fid: number | null;
      created_at: Date;
      movie_slug: string;
    };

    // For awaiting_confirmation scenes, include video URL, metadata, and attempt count
    if (scene.status === 'awaiting_confirmation') {
      const videoUrl = await getSignedVideoUrl(sceneIdNum, 3600);

      // Get attempt ID and prompt count
      const attemptResult = await query(`
        SELECT sga.id as attempt_id, COUNT(p.id) as prompt_count
        FROM scenes s
        JOIN scene_generation_attempts sga ON s.current_attempt_id = sga.id
        LEFT JOIN prompts p ON p.attempt_id = sga.id
        WHERE s.id = $1
        GROUP BY sga.id
      `, [sceneIdNum]);

      const attemptData = (attemptResult.rows[0] as { attempt_id: number; prompt_count: string } | undefined) || { attempt_id: null, prompt_count: '0' };

      return NextResponse.json({
        sceneId: scene.id,
        status: scene.status,
        videoUrl,
        metadataURI: scene.metadata_uri,
        slotLabel: scene.slot_label,
        creatorAddress: scene.creator_address,
        movieSlug: scene.movie_slug,
        attemptId: attemptData.attempt_id,
        promptCount: parseInt(String(attemptData.prompt_count))
      });
    }

    // For completed scenes, return basic info
    if (scene.status === 'completed') {
      return NextResponse.json({
        sceneId: scene.id,
        status: scene.status,
        slotLabel: scene.slot_label,
        creatorAddress: scene.creator_address,
        movieSlug: scene.movie_slug
      });
    }

    // For other statuses, just return status
    return NextResponse.json({
      sceneId: scene.id,
      status: scene.status
    });

  } catch (error) {
    console.error('Error fetching scene status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scene status' },
      { status: 500 }
    );
  }
}
