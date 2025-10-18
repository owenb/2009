/**
 * Sora 2 Video Generation Integration (Server-Side)
 * Uses OpenAI's Sora 2 API for video generation
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_BASE = 'https://api.openai.com/v1';

export interface SoraConfig {
  model?: 'sora-2' | 'sora-2-pro';
  size?: '1280x720' | '720x1280' | '1792x1024' | '1024x1792';
  seconds?: '4' | '8' | '12';
  inputReference?: Blob;
}

export interface SoraVideo {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  url?: string;
  downloadUrl?: string;
  error?: {
    message: string;
    code?: string;
  };
}

export interface SoraProgress {
  status: string;
  attempt: number;
  maxAttempts: number;
}

export type ProgressCallback = (progress: SoraProgress) => void;

export interface SoraModel {
  id: string;
  name: string;
  description: string;
  estimatedTime: string;
  maxDuration: number;
  supportedSizes: string[];
}

export interface SoraAspectRatio {
  value: string;
  label: string;
  aspectRatio: string;
}

export interface SoraDuration {
  value: string;
  label: string;
}

/**
 * Generate a video using Sora 2
 * @param prompt - Video generation prompt
 * @param config - Configuration options
 * @param onProgress - Progress callback function
 * @returns Video object with URL
 */
export async function generateVideoWithSora(
  prompt: string,
  config: SoraConfig = {},
  onProgress: ProgressCallback | null = null
): Promise<SoraVideo> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not found. Please add OPENAI_API_KEY to your environment.');
  }

  const {
    model = 'sora-2',
    size = '720x1280', // 9:16 portrait for mobile
    seconds = '8',
    inputReference = undefined
  } = config;

  console.log('Generating video with Sora:', { prompt, model, size, seconds, hasInputReference: !!inputReference });

  try {
    // Step 1: Create video generation job
    let createResponse: Response;

    if (inputReference) {
      // Use multipart/form-data for input_reference
      const formData = new FormData();
      formData.append('prompt', prompt);
      formData.append('model', model);
      formData.append('size', size);
      formData.append('seconds', seconds);
      formData.append('input_reference', inputReference, 'reference.png');

      createResponse = await fetch(`${OPENAI_API_BASE}/videos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData
      });
    } else {
      // Use JSON for simple generation
      createResponse = await fetch(`${OPENAI_API_BASE}/videos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          size: size,
          seconds: seconds
        })
      });
    }

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(error.error?.message || 'Failed to create Sora video generation job');
    }

    const videoJob: SoraVideo = await createResponse.json();
    console.log('Sora video job created:', videoJob);

    // Step 2: Poll for completion
    const completedVideo = await pollVideoStatus(videoJob.id, onProgress);

    return completedVideo;
  } catch (error) {
    console.error('Sora video generation error:', error);
    throw error;
  }
}

/**
 * Poll video generation status until completion
 * @param videoId - Video job ID
 * @param onProgress - Progress callback
 * @returns Completed video object
 */
async function pollVideoStatus(
  videoId: string,
  onProgress: ProgressCallback | null = null
): Promise<SoraVideo> {
  const maxAttempts = 120; // 10 minutes max
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const statusResponse = await fetch(`${OPENAI_API_BASE}/videos/${videoId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      }
    });

    if (!statusResponse.ok) {
      const error = await statusResponse.json();
      throw new Error(error.error?.message || 'Failed to check video status');
    }

    const video: SoraVideo = await statusResponse.json();
    console.log(`Polling attempt ${attempt + 1}/${maxAttempts}:`, video.status);

    // Update progress
    if (onProgress) {
      onProgress({
        status: video.status,
        attempt: attempt + 1,
        maxAttempts: maxAttempts
      });
    }

    // Check status
    if (video.status === 'completed') {
      console.log('Video completed:', video);

      // Set the download URL - /v1/videos/{id}/content
      const downloadEndpoint = `${OPENAI_API_BASE}/videos/${videoId}/content`;
      console.log('Download endpoint:', downloadEndpoint);

      video.url = downloadEndpoint;
      video.downloadUrl = downloadEndpoint;

      return video;
    } else if (video.status === 'failed') {
      throw new Error(video.error?.message || 'Video generation failed');
    }

    // Continue polling if 'queued' or 'in_progress'
  }

  throw new Error('Video generation timed out after 10 minutes');
}

/**
 * Download video from Sora URL
 * @param videoUrl - URL of the generated video
 * @returns Video blob
 */
export async function downloadSoraVideo(videoUrl: string): Promise<Blob> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not found');
  }

  const response = await fetch(videoUrl, {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  return await response.blob();
}

/**
 * Get supported Sora models
 */
export function getSoraModels(): SoraModel[] {
  return [
    {
      id: 'sora-2',
      name: 'Sora 2',
      description: 'Standard quality, faster generation',
      estimatedTime: '2-4 minutes',
      maxDuration: 12,
      supportedSizes: ['1280x720', '720x1280']
    },
    {
      id: 'sora-2-pro',
      name: 'Sora 2 Pro',
      description: 'Premium quality, better consistency',
      estimatedTime: '4-8 minutes',
      maxDuration: 12,
      supportedSizes: ['1792x1024', '1024x1792']
    }
  ];
}

/**
 * Get supported aspect ratios for Sora
 * @param model - 'sora-2' or 'sora-2-pro'
 */
export function getSoraAspectRatios(model: string = 'sora-2'): SoraAspectRatio[] {
  if (model === 'sora-2-pro') {
    return [
      { value: '1792x1024', label: '16:9 (Landscape HD)', aspectRatio: '16:9' },
      { value: '1024x1792', label: '9:16 (Portrait HD)', aspectRatio: '9:16' }
    ];
  }

  return [
    { value: '1280x720', label: '16:9 (Landscape 720p)', aspectRatio: '16:9' },
    { value: '720x1280', label: '9:16 (Portrait 720p)', aspectRatio: '9:16' }
  ];
}

/**
 * Get supported durations for Sora
 */
export function getSoraDurations(): SoraDuration[] {
  return [
    { value: '4', label: '4 seconds' },
    { value: '8', label: '8 seconds' },
    { value: '12', label: '12 seconds' }
  ];
}

/**
 * Convert aspect ratio string to Sora size format
 * @param aspectRatio - Aspect ratio (e.g., '16:9', '9:16')
 * @param model - Model type ('sora-2' or 'sora-2-pro')
 * @returns Sora size format (e.g., '1280x720')
 */
export function aspectRatioToSize(aspectRatio: string, model: string = 'sora-2'): string {
  const isPro = model === 'sora-2-pro';

  const sizeMap: Record<string, string> = {
    '16:9': isPro ? '1792x1024' : '1280x720',
    '9:16': isPro ? '1024x1792' : '720x1280'
  };

  return sizeMap[aspectRatio] || (isPro ? '1792x1024' : '1280x720');
}

/**
 * List user's Sora video generations
 * @returns List of video objects
 */
export async function listSoraVideos(): Promise<SoraVideo[]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not found');
  }

  const response = await fetch(`${OPENAI_API_BASE}/videos`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to list videos');
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Delete a Sora video
 * @param videoId - Video ID to delete
 */
export async function deleteSoraVideo(videoId: string): Promise<void> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not found');
  }

  const response = await fetch(`${OPENAI_API_BASE}/videos/${videoId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to delete video');
  }
}

/**
 * Check if Sora API is available
 */
export async function checkSoraAvailability(): Promise<{ available: boolean; error?: string; message?: string }> {
  if (!OPENAI_API_KEY) {
    return { available: false, error: 'No API key' };
  }

  try {
    // Try to list videos as a simple API check
    await listSoraVideos();
    return { available: true };
  } catch (error) {
    return {
      available: false,
      error: (error as Error).message,
      message: 'Sora API may not be enabled for your account. Contact OpenAI support for access.'
    };
  }
}

/**
 * Check video status without polling
 * @param videoId - Video job ID
 * @returns Current video status
 */
export async function checkVideoStatus(videoId: string): Promise<SoraVideo> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not found');
  }

  const response = await fetch(`${OPENAI_API_BASE}/videos/${videoId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to check video status');
  }

  const video: SoraVideo = await response.json();

  // Add download URL if completed
  if (video.status === 'completed') {
    video.url = `${OPENAI_API_BASE}/videos/${videoId}/content`;
    video.downloadUrl = video.url;
  }

  return video;
}
