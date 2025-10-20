import { NextRequest, NextResponse } from 'next/server';
import { getSlotsForScene } from '@/lib/db/scenes';
import { getSignedVideoUrl } from '@/lib/r2';

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

    // Get all slots using helper function
    const slots = await getSlotsForScene(parentId);

    // ALWAYS generate signed URLs for completed slots (for pre-caching)
    for (const slot of slots) {
      if (slot.exists && slot.status === 'completed' && slot.sceneId) {
        try {
          // Generate 1-hour signed URL for this video
          slot.videoUrl = await getSignedVideoUrl(slot.sceneId, 3600);
        } catch (error) {
          console.error(`Failed to generate video URL for scene ${slot.sceneId}:`, error);
          // Don't fail the entire request if one video URL fails
        }
      }
    }

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
