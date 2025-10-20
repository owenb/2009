import { NextResponse } from "next/server";
import { getSceneById, getSceneVideoUrl } from "@/lib/db/scenes";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;

    // Handle genesis scene
    if (sceneId === 'genesis' || sceneId === '0') {
      return NextResponse.json({
        sceneId: 0,
        videoUrl: '/intro/intro.mp4',
        slotLabel: 'Genesis Scene',
        creatorAddress: null,
        creatorFid: null,
        createdAt: new Date('2009-01-03').toISOString()
      });
    }

    // Fetch scene from database using helper
    const scene = await getSceneById(parseInt(sceneId, 10));

    if (!scene || scene.status !== 'completed') {
      return NextResponse.json(
        { error: 'Scene not found or not yet completed' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      sceneId: scene.id,
      videoUrl: getSceneVideoUrl(scene.id),
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
