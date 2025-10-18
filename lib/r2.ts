/**
 * Cloudflare R2 Storage Utilities
 * Uses S3-compatible API for video storage
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Initialize R2 client (S3-compatible)
function getR2Client(): S3Client {
  // Explicitly use R2 credentials from .env.local (not system environment)
  const endpoint = process.env.AWS_S3_ENDPOINT;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!;
  const region = process.env.AWS_REGION || 'auto';

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing R2 credentials. Ensure AWS_S3_ENDPOINT, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY are set in .env.local'
    );
  }

  return new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true, // Required for R2
  });
}

/**
 * Get a signed URL for a video file in R2
 *
 * @param sceneId - The scene ID, or null for the intro video
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns Signed URL for video playback
 */
export async function getSignedVideoUrl(
  sceneId: number | null,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  const bucketName = process.env.AWS_S3_BUCKET_NAME;

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
 * Utility function for consistent naming
 */
export function getVideoKey(sceneId: number | null): string {
  return sceneId === null ? 'INTRO.mp4' : `${sceneId}.mp4`;
}
