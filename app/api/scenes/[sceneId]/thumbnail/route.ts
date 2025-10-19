import { NextResponse } from "next/server";
import { minikitConfig } from "@/minikit.config";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    // Await params for Next.js 15 compatibility
    await params;
    // For now, redirect to the hero image as thumbnail
    // In the future, you could:
    // 1. Generate video thumbnails during upload
    // 2. Extract first frame from video
    // 3. Use a default scene-specific thumbnail

    const heroImageUrl = minikitConfig.miniapp.heroImageUrl;

    // Redirect to hero image
    return NextResponse.redirect(heroImageUrl);

  } catch (error) {
    console.error('Error fetching thumbnail:', error);

    // Fallback to hero image
    return NextResponse.redirect(minikitConfig.miniapp.heroImageUrl);
  }
}
