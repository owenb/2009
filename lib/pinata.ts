/**
 * Pinata IPFS Integration
 * Uploads NFT metadata to IPFS for confirmScene() call
 */

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_API_BASE = 'https://api.pinata.cloud';

export interface NFTMetadata {
  name: string;              // "2009 Scene #123"
  description: string;       // User's prompt or slot label
  animation_url: string;     // R2 video URL (https://...)
  image?: string;            // Optional thumbnail
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

/**
 * Upload NFT metadata to IPFS via Pinata
 * @param sceneId - Scene ID from smart contract
 * @param movieSlug - Movie identifier (e.g., "2009")
 * @param videoUrl - R2 video URL (public HTTPS)
 * @param slotLabel - Scene description
 * @returns IPFS URI (ipfs://Qm...)
 */
export async function uploadMetadataToPinata(
  sceneId: number,
  movieSlug: string,
  videoUrl: string,
  slotLabel: string
): Promise<string> {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    throw new Error('Pinata credentials missing in environment');
  }

  // Construct ERC-721 metadata
  const metadata: NFTMetadata = {
    name: `${movieSlug.toUpperCase()} Scene #${sceneId}`,
    description: slotLabel,
    animation_url: videoUrl, // Points to R2 (public HTTPS)
    image: videoUrl.replace('.mp4', '-thumbnail.jpg'), // Optional: if you generate thumbnails
    attributes: [
      { trait_type: 'Movie', value: movieSlug },
      { trait_type: 'Scene ID', value: sceneId },
      { trait_type: 'Type', value: 'Video Scene' }
    ]
  };

  console.log('[Pinata] Uploading metadata:', metadata);

  // Upload to Pinata
  const response = await fetch(`${PINATA_API_BASE}/pinning/pinJSONToIPFS`, {
    method: 'POST',
    headers: {
      'pinata_api_key': PINATA_API_KEY,
      'pinata_secret_api_key': PINATA_SECRET_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: {
        name: `Scene-${sceneId}-${movieSlug}.json`
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Pinata upload failed: ${JSON.stringify(error)}`);
  }

  const result = await response.json();
  const ipfsHash = result.IpfsHash;

  console.log(`[Pinata] ✓ Metadata uploaded: ipfs://${ipfsHash}`);

  return `ipfs://${ipfsHash}`;
}
