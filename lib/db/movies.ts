/**
 * Database helper functions for movies
 * All movie-related queries in one place
 */

import { query } from '@/lib/db';
import type {
  Movie,
  MovieWithGenesis,
  CreateMovieInput,
  UpdateMovieInput,
  MovieFilters,
  MovieSortOptions,
} from './types';

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get a movie by its slug (used in URLs like /movie/2009)
 */
export async function getMovieBySlug(slug: string): Promise<Movie | null> {
  const result = await query<Movie>(
    `SELECT * FROM movies WHERE slug = $1 LIMIT 1`,
    [slug]
  );

  return result.rows[0] || null;
}

/**
 * Get a movie by its numeric ID
 */
export async function getMovieById(id: number): Promise<Movie | null> {
  const result = await query<Movie>(
    `SELECT * FROM movies WHERE id = $1 LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

/**
 * Get a movie with its genesis scene information
 * Includes video URL for the genesis scene
 */
export async function getMovieWithGenesis(slug: string): Promise<MovieWithGenesis | null> {
  const result = await query<MovieWithGenesis>(
    `SELECT
      m.*,
      CASE
        WHEN m.genesis_scene_id IS NOT NULL
        THEN CONCAT('https://', $2::text, '.r2.cloudflarestorage.com/', m.genesis_scene_id::text, '.mp4')
        ELSE NULL
      END as genesis_video_url
    FROM movies m
    WHERE m.slug = $1
    LIMIT 1`,
    [slug, process.env.AWS_S3_BUCKET_NAME]
  );

  return result.rows[0] || null;
}

/**
 * Get all movies with optional filtering and sorting
 * Used for movie browser/discovery page
 */
export async function getMovies(
  filters: MovieFilters = {},
  options: MovieSortOptions = {}
): Promise<{ movies: Movie[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramCount = 1;

  // Apply filters
  if (filters.status) {
    conditions.push(`status = $${paramCount++}`);
    params.push(filters.status);
  }

  if (filters.genre) {
    conditions.push(`genre = $${paramCount++}`);
    params.push(filters.genre);
  }

  if (filters.creator_address) {
    conditions.push(`creator_address = $${paramCount++}`);
    params.push(filters.creator_address);
  }

  if (filters.search) {
    conditions.push(
      `(
        title ILIKE $${paramCount} OR
        description ILIKE $${paramCount} OR
        $${paramCount} = ANY(themes)
      )`
    );
    params.push(`%${filters.search}%`);
    paramCount++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM movies ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.count || '0', 10);

  // Apply sorting
  const sortBy = options.sortBy || 'created_at';
  const sortOrder = options.sortOrder || 'desc';
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const orderClause = `ORDER BY ${sortBy} ${sortOrder}`;
  const limitClause = `LIMIT $${paramCount++} OFFSET $${paramCount++}`;
  params.push(limit, offset);

  // Get movies
  const moviesResult = await query<Movie>(
    `SELECT * FROM movies ${whereClause} ${orderClause} ${limitClause}`,
    params
  );

  return {
    movies: moviesResult.rows,
    total,
  };
}

/**
 * Get all movies by a specific creator
 */
export async function getMoviesByCreator(
  creatorAddress: string,
  options: MovieSortOptions = {}
): Promise<Movie[]> {
  const result = await getMovies({ creator_address: creatorAddress }, options);
  return result.movies;
}

/**
 * Get featured movies (active movies, sorted by views or scenes)
 * Used for homepage featured section
 */
export async function getFeaturedMovies(limit: number = 6): Promise<Movie[]> {
  const result = await query<Movie>(
    `SELECT * FROM movies
     WHERE status = 'active'
     ORDER BY total_views DESC, total_scenes DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

/**
 * Get movie statistics
 */
export async function getMovieStats(movieId: number): Promise<{
  totalScenes: number;
  totalViews: number;
  uniqueCreators: number;
  oldestScene: Date | null;
  newestScene: Date | null;
}> {
  const result = await query<{
    total_scenes: string;
    total_views: string;
    unique_creators: string;
    oldest_scene: Date | null;
    newest_scene: Date | null;
  }>(
    `SELECT
      COUNT(s.id) as total_scenes,
      COALESCE(SUM(s.view_count), 0) as total_views,
      COUNT(DISTINCT s.creator_address) as unique_creators,
      MIN(s.created_at) as oldest_scene,
      MAX(s.created_at) as newest_scene
    FROM scenes s
    WHERE s.movie_id = $1 AND s.status = 'completed'`,
    [movieId]
  );

  const stats = result.rows[0];
  return {
    totalScenes: parseInt(stats?.total_scenes || '0', 10),
    totalViews: parseInt(stats?.total_views || '0', 10),
    uniqueCreators: parseInt(stats?.unique_creators || '0', 10),
    oldestScene: stats?.oldest_scene || null,
    newestScene: stats?.newest_scene || null,
  };
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Create a new movie
 * Returns the created movie with generated ID
 */
export async function createMovie(input: CreateMovieInput): Promise<Movie> {
  const result = await query<Movie>(
    `INSERT INTO movies (
      slug,
      title,
      description,
      cover_image_url,
      genre,
      themes,
      content_guidelines,
      creator_address,
      creator_fid,
      creator_display_name,
      deposit_amount_wei,
      scene_price_wei,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      input.slug,
      input.title,
      input.description || null,
      input.cover_image_url || null,
      input.genre || null,
      input.themes || null,
      input.content_guidelines || null,
      input.creator_address,
      input.creator_fid || null,
      input.creator_display_name || null,
      input.deposit_amount_wei || null,
      input.scene_price_wei || null,
      input.status || 'draft',
    ]
  );

  return result.rows[0];
}

/**
 * Update a movie's metadata or status
 */
export async function updateMovie(
  movieId: number,
  updates: UpdateMovieInput
): Promise<Movie | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let paramCount = 1;

  // Build dynamic UPDATE query based on provided fields
  if (updates.description !== undefined) {
    fields.push(`description = $${paramCount++}`);
    params.push(updates.description);
  }

  if (updates.cover_image_url !== undefined) {
    fields.push(`cover_image_url = $${paramCount++}`);
    params.push(updates.cover_image_url);
  }

  if (updates.content_guidelines !== undefined) {
    fields.push(`content_guidelines = $${paramCount++}`);
    params.push(updates.content_guidelines);
  }

  if (updates.status !== undefined) {
    fields.push(`status = $${paramCount++}`);
    params.push(updates.status);
  }

  if (updates.total_scenes !== undefined) {
    fields.push(`total_scenes = $${paramCount++}`);
    params.push(updates.total_scenes);
  }

  if (updates.total_views !== undefined) {
    fields.push(`total_views = $${paramCount++}`);
    params.push(updates.total_views);
  }

  if (fields.length === 0) {
    // No updates provided, return current movie
    return getMovieById(movieId);
  }

  // Always update updated_at timestamp
  fields.push(`updated_at = NOW()`);

  params.push(movieId);

  const result = await query<Movie>(
    `UPDATE movies
     SET ${fields.join(', ')}
     WHERE id = $${paramCount}
     RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

/**
 * Set the genesis scene ID for a movie
 * Called after genesis scene is created
 */
export async function setGenesisScene(movieId: number, sceneId: number): Promise<Movie | null> {
  const result = await query<Movie>(
    `UPDATE movies
     SET genesis_scene_id = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [sceneId, movieId]
  );

  return result.rows[0] || null;
}

/**
 * Increment movie's total_scenes count
 * Called when a new scene is completed
 */
export async function incrementMovieScenes(movieId: number): Promise<void> {
  await query(
    `UPDATE movies
     SET total_scenes = total_scenes + 1, updated_at = NOW()
     WHERE id = $1`,
    [movieId]
  );
}

/**
 * Increment movie's total_views count
 * Called when a scene in the movie is viewed
 */
export async function incrementMovieViews(movieId: number, count: number = 1): Promise<void> {
  await query(
    `UPDATE movies
     SET total_views = total_views + $1, updated_at = NOW()
     WHERE id = $2`,
    [count, movieId]
  );
}

/**
 * Update movie status (activate, pause, archive)
 */
export async function updateMovieStatus(
  movieId: number,
  status: 'draft' | 'active' | 'paused' | 'archived'
): Promise<Movie | null> {
  return updateMovie(movieId, { status });
}

// ============================================================================
// VALIDATION / CHECKS
// ============================================================================

/**
 * Check if a slug is already taken
 */
export async function isSlugTaken(slug: string): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM movies WHERE slug = $1) as exists`,
    [slug]
  );

  return result.rows[0]?.exists || false;
}

/**
 * Check if a movie is active and accepting contributions
 */
export async function isMovieActive(movieId: number): Promise<boolean> {
  const result = await query<{ status: string }>(
    `SELECT status FROM movies WHERE id = $1 LIMIT 1`,
    [movieId]
  );

  return result.rows[0]?.status === 'active';
}
