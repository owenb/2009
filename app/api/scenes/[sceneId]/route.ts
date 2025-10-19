import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface SceneRow {
  scene_id: number;
  parent_id: number | null;
  slot: string;
  slot_label: string | null;
  status: string;
  created_at: Date;
  creator_address: string | null;
  creator_fid: number | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;

    // Handle genesis scene
    if (sceneId === 'genesis') {
      return NextResponse.json({
        id: 1,
        videoUrl: '/intro/intro.mp4',
        slotLabel: 'Genesis Scene',
        creatorAddress: null,
        creatorFid: null,
        createdAt: new Date('2009-01-03').toISOString()
      });
    }

    // Fetch scene from database
    const result = await query<SceneRow>(
      `SELECT
        s.id as scene_id,
        s.parent_id,
        s.slot,
        s.slot_label,
        s.status,
        s.created_at,
        s.creator_address,
        s.creator_fid
      FROM scenes s
      WHERE s.id = $1
        AND s.status = 'completed'
      LIMIT 1`,
      [sceneId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Scene not found or not yet completed' },
        { status: 404 }
      );
    }

    const scene = result.rows[0];

    // Video files are stored as {scene_id}.mp4
    const videoUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.r2.cloudflarestorage.com/${scene.scene_id}.mp4`;

    return NextResponse.json({
      id: scene.scene_id,
      videoUrl,
      slotLabel: scene.slot_label || `Slot ${scene.slot}`,
      creatorAddress: scene.creator_address,
      creatorFid: scene.creator_fid,
      createdAt: scene.created_at
    });

  } catch (error) {
    console.error('Error fetching scene:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scene' },
      { status: 500 }
    );
  }
}
