/**
 * Cloudflare R2 Storage Utility (Merged Version)
 * Combines upload functionality with signed URL generation
 * Uses S3-compatible API for video storage
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Create S3-compatible client for R2
 *
 * Reads env vars lazily to ensure they're loaded (e.g., from dotenv)
 */
function getR2Client(): S3Client {
  // Read from process.env at runtime, not at module load time
  const endpoint = process.env.AWS_S3_ENDPOINT;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing R2 credentials. Ensure AWS_S3_ENDPOINT, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY are set in .env.local'
    );
  }

  return new S3Client({
    region: 'auto', // R2 requires 'auto' as region for signed URLs
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    // Don't use forcePathStyle for R2 - it causes signature issues
  });
}

/**
 * Get bucket name from env (with default)
 */
function getBucketName(): string {
  return process.env.AWS_S3_BUCKET_NAME || 'scenes';
}

/**
 * Get public URL base from env
 */
function getPublicUrlBase(): string {
  return process.env.R2_PUBLIC_URL || 'https://scenes.your-domain.com';
}

/**
 * Get a signed URL for a video file in R2 (for reading/playback)
 *
 * Uses new structure: {movie_slug}/{scene_id}.mp4
 * Requires database lookup to get movie slug
 *
 * @param sceneId - The scene ID (no longer accepts null - genesis scenes use their actual ID)
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns Signed URL for video playback
 */
export async function getSignedVideoUrl(
  sceneId: number,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  // Get movie slug from database to construct path
  const key = await getVideoKey(sceneId);

  const client = getR2Client();

  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });

  // Generate signed URL that expires in the specified time
  const signedUrl = await getSignedUrl(client, command, { expiresIn });

  return signedUrl;
}

/**
 * Get video key (R2 path) for a given scene ID
 *
 * New structure: {movie_slug}/{scene_id}.mp4
 * Requires database lookup to get movie slug
 *
 * @param sceneId - Scene ID (global across all movies)
 * @returns R2 key path (e.g., "2009/17.mp4")
 */
export async function getVideoKey(sceneId: number): Promise<string> {
  // Import here to avoid circular dependencies
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.POSTGRES_URL!);

  const result = await sql`
    SELECT m.slug
    FROM scenes s
    JOIN movies m ON s.movie_id = m.id
    WHERE s.id = ${sceneId}
    LIMIT 1
  `;

  if (result.length === 0) {
    throw new Error(`Scene ${sceneId} not found in database`);
  }

  const movieSlug = result[0].slug;
  return `${movieSlug}/${sceneId}.mp4`;
}

/**
 * Upload a video to R2 storage
 *
 * New structure: {movie_slug}/{scene_id}.mp4
 *
 * @param sceneId - Scene ID (global)
 * @param movieSlug - Movie slug (e.g., "2009", "mochi")
 * @param videoBlob - Video blob to upload
 * @returns Public URL of uploaded video
 */
export async function uploadVideoToR2(
  sceneId: number,
  movieSlug: string,
  videoBlob: Blob
): Promise<string> {
  const client = getR2Client();
  const key = `${movieSlug}/${sceneId}.mp4`;

  // Convert Blob to Buffer for Node.js environment
  const buffer = Buffer.from(await videoBlob.arrayBuffer());

  console.log(`Uploading video to R2: ${key} (${buffer.length} bytes)`);

  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    Body: buffer,
    ContentType: 'video/mp4',
    CacheControl: 'public, max-age=31536000', // Cache for 1 year
    Metadata: {
      sceneId: sceneId.toString(),
      movieSlug: movieSlug,
      uploadedAt: new Date().toISOString()
    }
  });

  await client.send(command);

  console.log(`Video uploaded successfully: ${key}`);

  // Return public URL
  return `${getPublicUrlBase()}/${key}`;
}

/**
 * Upload video from URL (download and re-upload to R2)
 *
 * Useful for downloading from video generation API and uploading to R2
 *
 * @param sceneId - Scene ID
 * @param movieSlug - Movie slug (e.g., "2009", "mochi")
 * @param videoUrl - Source video URL
 * @param authHeader - Optional authorization header for downloading
 * @returns Public URL of uploaded video
 */
export async function uploadVideoFromUrl(
  sceneId: number,
  movieSlug: string,
  videoUrl: string,
  authHeader?: string
): Promise<string> {
  console.log(`Downloading video from: ${videoUrl}`);

  // Download video
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const response = await fetch(videoUrl, { headers });

  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
  }

  const videoBlob = await response.blob();
  console.log(`Downloaded video: ${videoBlob.size} bytes`);

  // Upload to R2
  return await uploadVideoToR2(sceneId, movieSlug, videoBlob);
}

/**
 * Check if a video exists in R2
 *
 * Uses new structure: {movie_slug}/{scene_id}.mp4
 *
 * @param sceneId - Scene ID
 * @returns True if video exists
 */
export async function videoExists(sceneId: number): Promise<boolean> {
  const client = getR2Client();
  const key = await getVideoKey(sceneId);

  try {
    const command = new HeadObjectCommand({
      Bucket: getBucketName(),
      Key: key
    });

    await client.send(command);
    return true;
  } catch (error) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Get video metadata from R2
 *
 * Uses new structure: {movie_slug}/{scene_id}.mp4
 *
 * @param sceneId - Scene ID
 * @returns Video metadata (size, content type, etc.)
 */
export async function getVideoMetadata(sceneId: number): Promise<{
  size: number;
  contentType: string;
  lastModified: Date;
  metadata?: Record<string, string>;
}> {
  const client = getR2Client();
  const key = await getVideoKey(sceneId);

  const command = new HeadObjectCommand({
    Bucket: getBucketName(),
    Key: key
  });

  const response = await client.send(command);

  return {
    size: response.ContentLength || 0,
    contentType: response.ContentType || 'video/mp4',
    lastModified: response.LastModified || new Date(),
    metadata: response.Metadata
  };
}

/**
 * Delete a video from R2
 *
 * Uses new structure: {movie_slug}/{scene_id}.mp4
 *
 * @param sceneId - Scene ID
 */
export async function deleteVideoFromR2(sceneId: number): Promise<void> {
  const client = getR2Client();
  const key = await getVideoKey(sceneId);

  console.log(`Deleting video from R2: ${key}`);

  const command = new DeleteObjectCommand({
    Bucket: getBucketName(),
    Key: key
  });

  await client.send(command);

  console.log(`Video deleted: ${key}`);
}

/**
 * Generate a presigned URL for temporary access to a video
 *
 * Uses new structure: {movie_slug}/{scene_id}.mp4
 * (This is the same as getSignedVideoUrl - kept for backwards compatibility)
 *
 * @param sceneId - Scene ID
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns Presigned URL
 */
export async function getPresignedUrl(
  sceneId: number,
  expiresIn: number = 3600
): Promise<string> {
  // Just call getSignedVideoUrl - they do the same thing
  return getSignedVideoUrl(sceneId, expiresIn);
}

/**
 * Get public URL for a video (without presigning)
 *
 * NOTE: This returns a URL based on the new structure, but requires
 * async database lookup. For actual use, prefer getSignedVideoUrl().
 *
 * @param sceneId - Scene ID
 * @param movieSlug - Movie slug (must be provided since this is sync)
 * @returns Public URL
 */
export function getPublicVideoUrl(sceneId: number, movieSlug: string): string {
  return `${getPublicUrlBase()}/${movieSlug}/${sceneId}.mp4`;
}

/**
 * Upload buffer directly (for server-side use)
 *
 * New structure: {movie_slug}/{scene_id}.mp4
 *
 * @param sceneId - Scene ID
 * @param movieSlug - Movie slug (e.g., "2009", "mochi")
 * @param buffer - Video buffer
 * @returns Public URL
 */
export async function uploadVideoBuffer(
  sceneId: number,
  movieSlug: string,
  buffer: Buffer
): Promise<string> {
  const client = getR2Client();
  const key = `${movieSlug}/${sceneId}.mp4`;

  console.log(`Uploading video buffer to R2: ${key} (${buffer.length} bytes)`);

  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    Body: buffer,
    ContentType: 'video/mp4',
    CacheControl: 'public, max-age=31536000',
    Metadata: {
      sceneId: sceneId.toString(),
      movieSlug: movieSlug,
      uploadedAt: new Date().toISOString()
    }
  });

  await client.send(command);

  console.log(`Video buffer uploaded successfully: ${key}`);

  return `${getPublicUrlBase()}/${key}`;
}
