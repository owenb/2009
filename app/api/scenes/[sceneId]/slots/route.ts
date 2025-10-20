import { NextRequest, NextResponse } from 'next/server';
import { getSlotsForScene } from '@/lib/db/scenes';

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
