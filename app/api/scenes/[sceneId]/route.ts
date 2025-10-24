import { NextResponse } from "next/server";
import { getSceneById, getSceneVideoUrl } from "@/lib/db/scenes";
import { getMovieById } from "@/lib/db/movies";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;

    // Handle genesis scene - now uses R2 like all other scenes
    if (sceneId === 'genesis' || sceneId === '0') {
      // Get signed URL from R2 (scene ID 0 for "2009" movie)
      const scene = await getSceneById(0);

      if (!scene) {
        return NextResponse.json(
          { error: 'Genesis scene not found in database' },
          { status: 404 }
        );
      }

      // Fetch movie to get slug
      const movie = await getMovieById(scene.movie_id);

      return NextResponse.json({
        sceneId: 0,
        videoUrl: getSceneVideoUrl(0), // Returns /api/scenes/0/video endpoint
        slotLabel: scene.slot_label || 'Genesis Scene',
        creatorAddress: scene.creator_address,
        creatorFid: scene.creator_fid,
        createdAt: scene.created_at || new Date('2009-01-03').toISOString(),
        movieSlug: movie?.slug || '2009'
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

    // Fetch movie to get slug
    const movie = await getMovieById(scene.movie_id);

    if (!movie) {
      return NextResponse.json(
        { error: 'Movie not found for this scene' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      sceneId: scene.id,
      videoUrl: getSceneVideoUrl(scene.id),
      slotLabel: scene.slot_label || `Slot ${scene.slot}`,
      creatorAddress: scene.creator_address,
      creatorFid: scene.creator_fid,
      createdAt: scene.created_at,
      movieSlug: movie.slug
    });

  } catch (error) {
    console.error('Error fetching scene:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scene' },
      { status: 500 }
    );
  }
}
