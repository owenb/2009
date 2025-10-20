import { NextRequest, NextResponse } from 'next/server';
import { getMovies, getFeaturedMovies } from '@/lib/db/movies';
import type { MovieFilters, MovieSortOptions } from '@/lib/db/types';

/**
 * GET /api/movies
 * Browse and search movies with filtering and sorting
 *
 * Query params:
 * - status: 'draft' | 'active' | 'paused' | 'archived'
 * - genre: string
 * - search: string (searches title, description, themes)
 * - sortBy: 'created_at' | 'total_scenes' | 'total_views' | 'title'
 * - sortOrder: 'asc' | 'desc'
 * - limit: number (max 100, default 50)
 * - offset: number (for pagination)
 * - featured: 'true' to get featured movies only
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Check if requesting featured movies
    if (searchParams.get('featured') === 'true') {
      const limit = parseInt(searchParams.get('limit') || '6', 10);
      const movies = await getFeaturedMovies(Math.min(limit, 20));

      return NextResponse.json({
        movies,
        total: movies.length,
        featured: true,
      });
    }

    // Build filters
    const filters: MovieFilters = {};

    const status = searchParams.get('status');
    if (status && ['draft', 'active', 'paused', 'archived'].includes(status)) {
      filters.status = status as 'draft' | 'active' | 'paused' | 'archived';
    }

    const genre = searchParams.get('genre');
    if (genre) {
      filters.genre = genre;
    }

    const search = searchParams.get('search');
    if (search) {
      filters.search = search;
    }

    // Build sort options
    const options: MovieSortOptions = {};

    const sortBy = searchParams.get('sortBy');
    if (sortBy && ['created_at', 'total_scenes', 'total_views', 'title'].includes(sortBy)) {
      options.sortBy = sortBy as 'created_at' | 'total_scenes' | 'total_views' | 'title';
    }

    const sortOrder = searchParams.get('sortOrder');
    if (sortOrder && ['asc', 'desc'].includes(sortOrder)) {
      options.sortOrder = sortOrder as 'asc' | 'desc';
    }

    const limit = parseInt(searchParams.get('limit') || '50', 10);
    options.limit = Math.min(limit, 100); // Max 100 per page

    const offset = parseInt(searchParams.get('offset') || '0', 10);
    options.offset = Math.max(offset, 0);

    // Get movies
    const result = await getMovies(filters, options);

    return NextResponse.json({
      movies: result.movies,
      total: result.total,
      limit: options.limit,
      offset: options.offset,
      hasMore: (options.offset || 0) + result.movies.length < result.total,
    });

  } catch (error) {
    console.error('Error fetching movies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch movies' },
      { status: 500 }
    );
  }
}
