import { NextRequest, NextResponse } from 'next/server';
import { getMovieWithGenesis } from '@/lib/db/movies';

/**
 * GET /api/movies/[slug]
 * Get a movie by its slug (e.g., /api/movies/2009)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const movie = await getMovieWithGenesis(slug);

    if (!movie) {
      return NextResponse.json(
        { error: 'Movie not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: movie.id,
      slug: movie.slug,
      title: movie.title,
      description: movie.description,
      coverImageUrl: movie.cover_image_url,
      genre: movie.genre,
      themes: movie.themes,
      contentGuidelines: movie.content_guidelines,
      creatorAddress: movie.creator_address,
      creatorFid: movie.creator_fid,
      creatorDisplayName: movie.creator_display_name,
      genesisSceneId: movie.genesis_scene_id,
      genesisVideoUrl: movie.genesis_video_url,
      status: movie.status,
      totalScenes: movie.total_scenes,
      totalViews: movie.total_views,
      createdAt: movie.created_at,
      updatedAt: movie.updated_at,
    });

  } catch (error) {
    console.error('Error fetching movie:', error);
    return NextResponse.json(
      { error: 'Failed to fetch movie' },
      { status: 500 }
    );
  }
}
