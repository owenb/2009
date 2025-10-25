/**
 * Video utilities for frame extraction and manipulation
 * CLIENT-SIDE ONLY - uses HTML5 Canvas API
 */

/**
 * Extract the last frame from a video URL as a File object
 * This is the key to video continuation - use the last frame as input_reference
 */
export async function extractLastFrame(
  videoUrl: string,
  options?: {
    format?: 'png' | 'jpeg';
    quality?: number; // 0-1 for jpeg
  }
): Promise<File> {
  const format = options?.format || 'jpeg';
  const quality = options?.quality || 0.95;

  return new Promise((resolve, reject) => {
    // Create video element
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';

    // Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    // When metadata loads, seek to last frame
    video.onloadedmetadata = () => {
      // Set canvas size to video size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Seek to last frame (duration - 0.1s to ensure we get a valid frame)
      video.currentTime = Math.max(0, video.duration - 0.1);
    };

    // When seek completes, extract frame
    video.onseeked = () => {
      try {
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert canvas to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob from canvas'));
              return;
            }

            // Convert blob to File
            const file = new File(
              [blob],
              `last-frame-${Date.now()}.${format}`,
              { type: `image/${format}` }
            );

            console.log('✅ Extracted last frame:', {
              width: canvas.width,
              height: canvas.height,
              size: `${(file.size / 1024).toFixed(2)}KB`,
              format,
            });

            resolve(file);
          },
          `image/${format}`,
          quality
        );
      } catch (error) {
        reject(error);
      }
    };

    video.onerror = () => {
      reject(new Error('Failed to load video'));
    };

    // Start loading
    video.src = videoUrl;
  });
}

/**
 * Frame with metadata
 */
export interface ExtractedFrame {
  file: File;
  preview: string;
  timestamp: number;
  label: string;
}

/**
 * Extract multiple frames from the end of a video
 * Returns the last 5 frames for user selection
 */
export async function extractLastFrames(
  videoUrl: string,
  options?: {
    format?: 'png' | 'jpeg';
    quality?: number;
    count?: number; // Number of frames to extract (default: 5)
  }
): Promise<ExtractedFrame[]> {
  const format = options?.format || 'jpeg';
  const quality = options?.quality || 0.95;
  const count = options?.count || 5;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    let currentFrameIndex = 0;
    const frames: ExtractedFrame[] = [];

    // Calculate time offsets from the end
    // For 5 frames: -0.1s, -0.5s, -1.0s, -1.5s, -2.0s
    const getTimeOffset = (index: number): number => {
      if (index === 0) return 0.1; // Most recent frame
      return 0.5 + (index - 1) * 0.5; // Earlier frames
    };

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Start with the first frame (most recent)
      const offset = getTimeOffset(0);
      video.currentTime = Math.max(0, video.duration - offset);
    };

    video.onseeked = () => {
      try {
        // Draw current frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob from canvas'));
              return;
            }

            // Create File object
            const offset = getTimeOffset(currentFrameIndex);
            const timestamp = video.currentTime;
            const file = new File(
              [blob],
              `frame-${currentFrameIndex}-${Date.now()}.${format}`,
              { type: `image/${format}` }
            );

            // Create preview URL
            const preview = URL.createObjectURL(blob);

            // Add to frames array
            frames.push({
              file,
              preview,
              timestamp,
              label: currentFrameIndex === 0
                ? 'Last frame'
                : `-${offset.toFixed(1)}s`,
            });

            // Move to next frame or finish
            currentFrameIndex++;
            if (currentFrameIndex < count) {
              const nextOffset = getTimeOffset(currentFrameIndex);
              const nextTime = Math.max(0, video.duration - nextOffset);

              // Only seek if we're not going before the start
              if (nextTime >= 0) {
                video.currentTime = nextTime;
              } else {
                // We've reached the beginning of the video
                console.log('✅ Extracted frames:', frames.length);
                resolve(frames);
              }
            } else {
              console.log('✅ Extracted frames:', frames.length);
              resolve(frames);
            }
          },
          `image/${format}`,
          quality
        );
      } catch (error) {
        reject(error);
      }
    };

    video.onerror = () => {
      reject(new Error('Failed to load video'));
    };

    video.src = videoUrl;
  });
}

/**
 * Extract the first frame from a video URL as a File object
 * Useful for thumbnails
 */
export async function extractFirstFrame(
  videoUrl: string,
  options?: {
    format?: 'png' | 'jpeg';
    quality?: number;
  }
): Promise<File> {
  const format = options?.format || 'jpeg';
  const quality = options?.quality || 0.95;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      video.currentTime = 0.1; // First frame
    };

    video.onseeked = () => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob from canvas'));
              return;
            }

            const file = new File(
              [blob],
              `first-frame-${Date.now()}.${format}`,
              { type: `image/${format}` }
            );

            resolve(file);
          },
          `image/${format}`,
          quality
        );
      } catch (error) {
        reject(error);
      }
    };

    video.onerror = () => {
      reject(new Error('Failed to load video'));
    };

    video.src = videoUrl;
  });
}

/**
 * Create a preview URL from a File object
 */
export function createFilePreview(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Revoke a preview URL to free memory
 */
export function revokeFilePreview(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Download a file to the user's computer
 */
export function downloadFile(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
