/**
 * Test script for Sora 2 video generation
 * Run with: npx tsx scripts/test-sora.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local FIRST
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function testSoraGeneration() {
  // Import AFTER env is loaded
  const { generateVideoWithSora } = await import('../lib/sora');
  console.log('🎬 Starting Sora 2 Pro video generation...\n');

  const prompt = `A nostalgic 2009 bedroom scene with warm ambient lighting. On a desk: a classic MP3 player with click wheel, a portable gaming console, a smartphone with physical home button, scattered USB flash drives, and a golden cryptocurrency coin glowing softly. Dark moody aesthetic with purple and blue tones. Cinematic composition, detailed textures, retro technology vibe.`;

  try {
    const video = await generateVideoWithSora(
      prompt,
      {
        model: 'sora-2-pro',
        size: '1024x1792', // Portrait mode for Sora 2 Pro
        seconds: '8'
      },
      (progress) => {
        console.log(`📊 Progress: ${progress.status} (${progress.attempt}/${progress.maxAttempts})`);
      }
    );

    console.log('\n✅ Video generated successfully!');
    console.log('Video ID:', video.id);
    console.log('Status:', video.status);
    console.log('Download URL:', video.downloadUrl);
    console.log('\nTo download the video, use the download URL with your OpenAI API key.');

  } catch (error) {
    console.error('\n❌ Error generating video:', error);
    process.exit(1);
  }
}

testSoraGeneration();
