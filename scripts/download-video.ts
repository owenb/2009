/**
 * Download a generated Sora video
 * Run with: npx tsx scripts/download-video.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local FIRST
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function downloadVideo() {
  const { downloadSoraVideo } = await import('../lib/sora');

  const videoUrl = 'https://api.openai.com/v1/videos/video_68f48e929e2881989e8fcb251b9e38a60dccff60aac2400a/content';
  const outputPath = path.resolve(__dirname, '../test-videos/2009-retro-test.mp4');

  console.log('📥 Downloading video...');

  try {
    const blob = await downloadSoraVideo(videoUrl);
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    fs.writeFileSync(outputPath, buffer);

    console.log('✅ Video downloaded successfully!');
    console.log('📁 Saved to:', outputPath);
    console.log('📊 File size:', (buffer.length / 1024 / 1024).toFixed(2), 'MB');
  } catch (error) {
    console.error('❌ Error downloading video:', error);
    process.exit(1);
  }
}

downloadVideo();
