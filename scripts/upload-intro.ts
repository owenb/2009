#!/usr/bin/env node
/**
 * Upload intro video to R2
 *
 * Usage: tsx scripts/upload-intro.ts
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { join } from 'path';

async function uploadIntroVideo() {
  // Check environment variables
  const endpoint = process.env.AWS_S3_ENDPOINT;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  const region = process.env.AWS_REGION || 'auto';

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    console.error('Error: Missing R2 credentials');
    console.error('Required environment variables:');
    console.error('  - AWS_S3_ENDPOINT');
    console.error('  - AWS_ACCESS_KEY_ID');
    console.error('  - AWS_SECRET_ACCESS_KEY');
    console.error('  - AWS_S3_BUCKET_NAME');
    process.exit(1);
  }

  console.log('Initializing R2 client...');
  const client = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  // Read the intro video file
  const videoPath = join(__dirname, '../public/intro/intro.mp4');
  console.log(`Reading video from: ${videoPath}`);

  let videoBuffer: Buffer;
  try {
    videoBuffer = readFileSync(videoPath);
    console.log(`✓ Video loaded (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
  } catch (error) {
    console.error(`✗ Failed to read video file: ${error}`);
    process.exit(1);
  }

  // Upload to R2 as INTRO.mp4
  const key = 'INTRO.mp4';
  console.log(`Uploading to R2 bucket "${bucketName}" as "${key}"...`);

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: videoBuffer,
      ContentType: 'video/mp4',
    });

    await client.send(command);
    console.log(`✓ Successfully uploaded ${key} to R2`);
    console.log('');
    console.log('Upload complete! The intro video is now available in R2.');
  } catch (error) {
    console.error(`✗ Upload failed: ${error}`);
    process.exit(1);
  }
}

uploadIntroVideo();
