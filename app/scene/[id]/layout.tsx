import type { Metadata } from "next";
import { minikitConfig } from "../../../minikit.config";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: sceneId } = await params;

  // Fetch scene data for metadata
  let sceneData = null;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3001';
    const response = await fetch(`${baseUrl}/api/scenes/${sceneId}`, {
      cache: 'no-store'
    });
    if (response.ok) {
      sceneData = await response.json();
    }
  } catch (error) {
    console.error('Failed to fetch scene for metadata:', error);
  }

  const sceneUrl = `${minikitConfig.miniapp.homeUrl}/scene/${sceneId}`;
  const title = sceneData
    ? `2009: ${sceneData.slotLabel || 'Alternate Timeline'}`
    : '2009: Scene';

  const description = sceneData?.creatorAddress
    ? `Created by ${sceneData.creatorAddress.slice(0, 6)}...${sceneData.creatorAddress.slice(-4)}. Watch this alternate 2009 timeline!`
    : 'An alternate 2009 timeline. What happens when Bitcoin\'s story changes?';

  // Use video thumbnail as preview if available, otherwise use hero image
  const imageUrl = sceneData?.videoUrl
    ? `${minikitConfig.miniapp.homeUrl}/api/scenes/${sceneId}/thumbnail`
    : minikitConfig.miniapp.heroImageUrl;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [imageUrl],
      url: sceneUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
    other: {
      "fc:miniapp": JSON.stringify({
        version: minikitConfig.miniapp.version,
        imageUrl: imageUrl,
        button: {
          title: "Watch This Scene",
          action: {
            type: "launch_frame",
            name: `Watch in ${minikitConfig.miniapp.name}`,
            url: sceneUrl,
          },
        },
      }),
    },
  };
}

export default function SceneLayout({ children }: Props) {
  return <>{children}</>;
}
