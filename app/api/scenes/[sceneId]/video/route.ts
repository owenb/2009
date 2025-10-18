import { NextRequest, NextResponse } from 'next/server';
import { getSignedVideoUrl } from '@/lib/r2';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId: sceneIdParam } = await params;

    // Handle "genesis" or "null" as the intro scene (null sceneId → INTRO.mp4)
    let sceneId: number | null;

    if (sceneIdParam === 'genesis' || sceneIdParam === 'null') {
      sceneId = null; // Maps to INTRO.mp4 in R2
    } else {
      const parsed = parseInt(sceneIdParam, 10);
      if (isNaN(parsed)) {
        return NextResponse.json(
          { error: 'Invalid scene ID' },
          { status: 400 }
        );
      }
      sceneId = parsed;
    }

    // Generate signed URL (expires in 1 hour = 3600 seconds)
    const signedUrl = await getSignedVideoUrl(sceneId, 3600);

    // Calculate expiration timestamp
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    return NextResponse.json({
      url: signedUrl,
      expiresAt,
      sceneId,
    });

  } catch (error) {
    console.error('Error generating signed video URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate video URL' },
      { status: 500 }
    );
  }
}
