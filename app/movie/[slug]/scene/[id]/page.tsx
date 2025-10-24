"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import Video from "@/app/components/Video";
import SlotChoiceModal from "@/app/components/SlotChoiceModal";
import { MovieThemeProvider } from "@/app/components/MovieThemeProvider";
import { MovieColorScheme, DEFAULT_COLOR_SCHEME } from "@/app/types/movie";
import type { SceneData, PreloadedSlotsData } from "@/lib/types";
import type { Movie } from "@/lib/db/types";

interface ScenePageProps {
  params: Promise<{
    slug: string;
    id: string;
  }>;
}

export default function ScenePage({ params }: ScenePageProps) {
  const router = useRouter();
  const { address } = useAccount();
  const [movieSlug, setMovieSlug] = useState<string>('');
  const [sceneId, setSceneId] = useState<string>('');
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [movieData, setMovieData] = useState<Movie | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [preloadedSlots, setPreloadedSlots] = useState<PreloadedSlotsData | null>(null);
  const [sceneHistory, setSceneHistory] = useState<SceneData[]>([]);
  const [currentScene, setCurrentScene] = useState<SceneData | null>(null);

  // Unwrap params
  useEffect(() => {
    params.then(({ slug, id }) => {
      setMovieSlug(slug);
      setSceneId(id);
    });
  }, [params]);

  // Load movie and scene data
  useEffect(() => {
    if (!movieSlug || !sceneId) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch movie
        const movieResponse = await fetch(`/api/movies/${movieSlug}`);
        if (!movieResponse.ok) {
          throw new Error('Movie not found');
        }
        const movie = await movieResponse.json();
        setMovieData(movie);

        // Fetch scene
        const sceneResponse = await fetch(`/api/scenes/${sceneId}`);
        if (!sceneResponse.ok) {
          throw new Error('Scene not found');
        }
        const scene = await sceneResponse.json();

        // Verify scene belongs to this movie
        if (scene.movieId !== movie.id) {
          throw new Error('This scene does not belong to this movie');
        }

        setSceneData(scene);
        setCurrentScene(scene);
        setShowVideo(true);
      } catch (err) {
        console.error('Error loading data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load scene');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [movieSlug, sceneId]);

  // Preload slots when video starts
  useEffect(() => {
    if (!showVideo || !sceneData) {
      setPreloadedSlots(null);
      return;
    }

    const preloadSlots = async () => {
      try {
        const response = await fetch(`/api/scenes/${sceneData.sceneId}/slots`);
        if (!response.ok) {
          console.error('Failed to preload slots');
          return;
        }
        const data = await response.json();
        setPreloadedSlots(data);
        console.log('✅ Slots preloaded', data);
      } catch (err) {
        console.error('Error preloading slots:', err);
      }
    };

    preloadSlots();
  }, [showVideo, sceneData]);

  const handleVideoEnd = () => {
    setShowPopup(true);
  };

  const handleSlotSelected = (newSceneData: SceneData) => {
    setShowPopup(false);
    setPreloadedSlots(null);

    // Push current scene to history
    if (currentScene) {
      setSceneHistory(prev => [...prev, currentScene]);
    }

    // Update current scene
    setCurrentScene(newSceneData);
    setShowVideo(true);
  };

  const handleBack = () => {
    if (sceneHistory.length === 0) {
      // Go back to movie home if no history
      router.push(`/movie/${movieSlug}`);
      return;
    }

    const previousScene = sceneHistory[sceneHistory.length - 1];
    const newHistory = sceneHistory.slice(0, -1);

    setPreloadedSlots(null);
    setSceneHistory(newHistory);
    setCurrentScene(previousScene);
    // Keep modal visible and don't replay video
  };

  // Parse color scheme
  const colorScheme: MovieColorScheme = movieData?.color_scheme
    ? (movieData.color_scheme as unknown as MovieColorScheme)
    : DEFAULT_COLOR_SCHEME;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-full h-full relative overflow-hidden bg-black">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white font-source-code text-center">
          <p>Loading scene...</p>
        </div>
      </div>
    );
  }

  if (error || !sceneData || !movieData) {
    return (
      <div className="flex justify-center items-center w-full h-full relative overflow-hidden bg-black">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white font-source-code text-center">
          <p className="text-[#FF6B6B] mb-4">{error || 'Scene not found'}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-white/10 border-2 border-white/30 rounded-lg py-3 px-6 text-white font-source-code cursor-pointer transition-all duration-200 hover:bg-white/20 hover:border-white/50"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <MovieThemeProvider colorScheme={colorScheme}>
      <div className="flex justify-center items-center w-full h-full relative overflow-hidden">
        {/* Video player */}
        <Video
          sceneId={currentScene?.sceneId ?? null}
          isVisible={showVideo}
          onVideoEnd={handleVideoEnd}
          directUrl={currentScene?.videoUrl}
          creatorAddress={currentScene?.creatorAddress}
          creatorFid={currentScene?.creatorFid}
          slotLabel={currentScene?.slotLabel}
          viewerAddress={address}
          createdAt={currentScene?.createdAt}
        />

        {/* Hidden video elements for pre-caching next scenes */}
        {showVideo && preloadedSlots?.slots && preloadedSlots.slots.map((slot) => {
          // Only pre-cache completed slots with video URLs
          if (slot.videoUrl && slot.status === 'completed') {
            return (
              <video
                key={`precache-${currentScene?.sceneId}-${slot.slot}`}
                src={slot.videoUrl}
                preload="auto"
                muted
                playsInline
                className="absolute opacity-0 pointer-events-none w-px h-px -z-10"
              />
            );
          }
          return null;
        })}

        {/* Slot choice modal */}
        <SlotChoiceModal
          isVisible={showPopup}
          parentSceneId={currentScene?.sceneId ?? 'genesis'}
          movieSlug={movieSlug}
          onSlotSelected={handleSlotSelected}
          preloadedData={preloadedSlots}
          onBack={handleBack}
          canGoBack={sceneHistory.length > 0}
          backToLabel={sceneHistory.length > 0 ? sceneHistory[sceneHistory.length - 1].slotLabel : null}
        />
      </div>
    </MovieThemeProvider>
  );
}
