/**
 * Cloudflare R2 Storage Utility (Merged Version)
 * Combines upload functionality with signed URL generation
 * Uses S3-compatible API for video storage
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// R2 Configuration
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'scenes';
const AWS_S3_ENDPOINT = process.env.AWS_S3_ENDPOINT;

// Public URL base (customize based on your R2 public domain setup)
const PUBLIC_URL_BASE = process.env.R2_PUBLIC_URL || `https://scenes.your-domain.com`;

/**
 * Create S3-compatible client for R2
 */
function getR2Client(): S3Client {
  const endpoint = AWS_S3_ENDPOINT;
  const accessKeyId = AWS_ACCESS_KEY_ID;
  const secretAccessKey = AWS_SECRET_ACCESS_KEY;

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
 * Get a signed URL for a video file in R2 (for reading/playback)
 * FROM REMOTE: This function was in the pulled version
 *
 * @param sceneId - The scene ID, or null for the intro video
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns Signed URL for video playback
 */
export async function getSignedVideoUrl(
  sceneId: number | null,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  const bucketName = AWS_S3_BUCKET_NAME;

  if (!bucketName) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable is not set');
  }

  // Determine the video filename
  // Genesis/intro scene (sceneId === null) → INTRO.mp4
  // All other scenes → [sceneId].mp4
  const key = sceneId === null ? 'INTRO.mp4' : `${sceneId}.mp4`;

  const client = getR2Client();

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  // Generate signed URL that expires in the specified time
  const signedUrl = await getSignedUrl(client, command, { expiresIn });

  return signedUrl;
}

/**
 * Get video filename for a given scene ID
 * FROM REMOTE: Utility function for consistent naming
 */
export function getVideoKey(sceneId: number | null): string {
  return sceneId === null ? 'INTRO.mp4' : `${sceneId}.mp4`;
}

/**
 * Upload a video to R2 storage
 * FROM OUR IMPLEMENTATION: Needed for generation completion
 *
 * @param sceneId - Scene ID (used as filename: {sceneId}.mp4)
 * @param videoBlob - Video blob to upload
 * @returns Public URL of uploaded video
 */
export async function uploadVideoToR2(
  sceneId: number,
  videoBlob: Blob
): Promise<string> {
  const client = getR2Client();
  const key = `${sceneId}.mp4`;

  // Convert Blob to Buffer for Node.js environment
  const buffer = Buffer.from(await videoBlob.arrayBuffer());

  console.log(`Uploading video to R2: ${key} (${buffer.length} bytes)`);

  const command = new PutObjectCommand({
    Bucket: AWS_S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: 'video/mp4',
    CacheControl: 'public, max-age=31536000', // Cache for 1 year
    Metadata: {
      sceneId: sceneId.toString(),
      uploadedAt: new Date().toISOString()
    }
  });

  await client.send(command);

  console.log(`Video uploaded successfully: ${key}`);

  // Return public URL
  return `${PUBLIC_URL_BASE}/${key}`;
}

/**
 * Upload video from URL (download and re-upload to R2)
 * FROM OUR IMPLEMENTATION: Useful for downloading from Sora and uploading to R2
 *
 * @param sceneId - Scene ID
 * @param videoUrl - Source video URL
 * @param authHeader - Optional authorization header for downloading
 * @returns Public URL of uploaded video
 */
export async function uploadVideoFromUrl(
  sceneId: number,
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
  return await uploadVideoToR2(sceneId, videoBlob);
}

/**
 * Check if a video exists in R2
 * FROM OUR IMPLEMENTATION
 *
 * @param sceneId - Scene ID
 * @returns True if video exists
 */
export async function videoExists(sceneId: number): Promise<boolean> {
  const client = getR2Client();
  const key = `${sceneId}.mp4`;

  try {
    const command = new HeadObjectCommand({
      Bucket: AWS_S3_BUCKET_NAME,
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
 * FROM OUR IMPLEMENTATION
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
  const key = `${sceneId}.mp4`;

  const command = new HeadObjectCommand({
    Bucket: AWS_S3_BUCKET_NAME,
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
 * FROM OUR IMPLEMENTATION
 *
 * @param sceneId - Scene ID
 */
export async function deleteVideoFromR2(sceneId: number): Promise<void> {
  const client = getR2Client();
  const key = `${sceneId}.mp4`;

  console.log(`Deleting video from R2: ${key}`);

  const command = new DeleteObjectCommand({
    Bucket: AWS_S3_BUCKET_NAME,
    Key: key
  });

  await client.send(command);

  console.log(`Video deleted: ${key}`);
}

/**
 * Generate a presigned URL for temporary access to a video
 * FROM OUR IMPLEMENTATION: Alternative to getSignedVideoUrl with more options
 *
 * @param sceneId - Scene ID
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns Presigned URL
 */
export async function getPresignedUrl(
  sceneId: number,
  expiresIn: number = 3600
): Promise<string> {
  const client = getR2Client();
  const key = `${sceneId}.mp4`;

  const command = new GetObjectCommand({
    Bucket: AWS_S3_BUCKET_NAME,
    Key: key
  });

  const presignedUrl = await getSignedUrl(client, command, { expiresIn });

  return presignedUrl;
}

/**
 * Get public URL for a video (without presigning)
 * FROM OUR IMPLEMENTATION
 *
 * @param sceneId - Scene ID
 * @returns Public URL
 */
export function getPublicVideoUrl(sceneId: number): string {
  return `${PUBLIC_URL_BASE}/${sceneId}.mp4`;
}

/**
 * Upload buffer directly (for server-side use)
 * FROM OUR IMPLEMENTATION
 *
 * @param sceneId - Scene ID
 * @param buffer - Video buffer
 * @returns Public URL
 */
export async function uploadVideoBuffer(
  sceneId: number,
  buffer: Buffer
): Promise<string> {
  const client = getR2Client();
  const key = `${sceneId}.mp4`;

  console.log(`Uploading video buffer to R2: ${key} (${buffer.length} bytes)`);

  const command = new PutObjectCommand({
    Bucket: AWS_S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: 'video/mp4',
    CacheControl: 'public, max-age=31536000',
    Metadata: {
      sceneId: sceneId.toString(),
      uploadedAt: new Date().toISOString()
    }
  });

  await client.send(command);

  console.log(`Video buffer uploaded successfully: ${key}`);

  return `${PUBLIC_URL_BASE}/${key}`;
}
