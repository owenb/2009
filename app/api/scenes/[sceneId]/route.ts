import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL!);

export async function GET(
  request: NextRequest,
  { params }: { params: { sceneId: string } }
) {
  try {
    const { sceneId } = params;

    // Handle genesis scene
    if (sceneId === 'genesis') {
      return NextResponse.json({
        sceneId: null,
        videoUrl: '/intro/intro.mp4',
        slotLabel: 'Genesis Scene',
        creatorAddress: null,
        creatorFid: null,
        createdAt: new Date('2009-01-03').toISOString()
      });
    }

    // Fetch scene from database
    const scenes = await sql`
      SELECT
        s.id as scene_id,
        s.parent_id,
        s.slot,
        s.video_r2_key,
        s.status,
        s.created_at,
        sga.creator_address,
        sga.creator_fid,
        p.refined_prompt
      FROM scenes s
      LEFT JOIN scene_generation_attempts sga ON s.latest_attempt_id = sga.id
      LEFT JOIN prompts p ON sga.latest_prompt_id = p.id
      WHERE s.id = ${sceneId}
        AND s.status = 'completed'
      LIMIT 1
    `;

    if (scenes.length === 0) {
      return NextResponse.json(
        { error: 'Scene not found or not yet completed' },
        { status: 404 }
      );
    }

    const scene = scenes[0];

    // Construct R2 URL for the video
    const videoUrl = scene.video_r2_key
      ? `https://${process.env.AWS_S3_BUCKET_NAME}.r2.cloudflarestorage.com/${scene.video_r2_key}`
      : null;

    return NextResponse.json({
      sceneId: scene.scene_id,
      videoUrl,
      slotLabel: scene.refined_prompt ? scene.refined_prompt.slice(0, 50) + '...' : `Slot ${scene.slot}`,
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
