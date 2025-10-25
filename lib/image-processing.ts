import sharp from 'sharp';

export type VideoSize = '720x1280' | '1280x720' | '1024x1792' | '1792x1024';

export interface ImageResizeResult {
  resizedBuffer: Buffer;
  originalWidth: number;
  originalHeight: number;
  resizedWidth: number;
  resizedHeight: number;
  wasResized: boolean;
}

/**
 * Resize an image to match Sora video dimensions exactly
 * Uses smart cropping to maintain aspect ratio
 */
export async function resizeImageForVideo(
  imageFile: File,
  targetSize: VideoSize
): Promise<ImageResizeResult> {
  // Parse target dimensions
  const [targetWidth, targetHeight] = targetSize.split('x').map(Number);

  // Convert File to Buffer
  const arrayBuffer = await imageFile.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Get original dimensions
  const metadata = await sharp(buffer).metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  console.log('🖼️ Original image:', {
    width: originalWidth,
    height: originalHeight,
    format: metadata.format,
  });

  // Check if resize is needed
  const needsResize =
    originalWidth !== targetWidth || originalHeight !== targetHeight;

  if (!needsResize) {
    console.log('✅ Image already matches target dimensions');
    return {
      resizedBuffer: buffer,
      originalWidth,
      originalHeight,
      resizedWidth: targetWidth,
      resizedHeight: targetHeight,
      wasResized: false,
    };
  }

  console.log('🔄 Resizing image to:', {
    width: targetWidth,
    height: targetHeight,
  });

  // Resize using cover strategy (crops to fit)
  // This ensures exact dimensions while maintaining aspect ratio
  const resizedBuffer = await sharp(buffer)
    .resize(targetWidth, targetHeight, {
      fit: 'cover', // Crop to fill exact dimensions
      position: 'center', // Center the crop
    })
    .jpeg({ quality: 95 }) // High quality JPEG
    .toBuffer();

  console.log('✅ Image resized successfully');

  return {
    resizedBuffer,
    originalWidth,
    originalHeight,
    resizedWidth: targetWidth,
    resizedHeight: targetHeight,
    wasResized: true,
  };
}

/**
 * Create a File object from a Buffer
 */
export function bufferToFile(
  buffer: Buffer,
  filename: string,
  mimeType: string = 'image/jpeg'
): File {
  const uint8Array = new Uint8Array(buffer);
  const blob = new Blob([uint8Array], { type: mimeType });
  return new File([blob], filename, { type: mimeType });
}
