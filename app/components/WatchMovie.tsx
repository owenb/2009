"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useRouter } from "next/navigation";
import Video from "./Video";
import SlotChoiceModal from "./SlotChoiceModal";
import SceneMapModal from "./SceneMapModal";
import type { SceneData, PreloadedSlotsData, ActiveAttempt } from "@/lib/types";

interface WatchMovieProps {
  movieId: number;
  movieSlug: string;
  genesisSceneId: number;
}

export default function WatchMovie({ movieId: _movieId, movieSlug, genesisSceneId }: WatchMovieProps) {
  const { address } = useAccount(); // Get connected wallet address
  const { isFrameReady, setFrameReady } = useMiniKit(); // Base mini app initialization
  const router = useRouter();
  const [showVideo, setShowVideo] = useState(true); // Start with video visible
  const [showPopup, setShowPopup] = useState(false);
  const [currentScene, setCurrentScene] = useState<SceneData | null>(null);
  const [parentSceneId, setParentSceneId] = useState<number | 'genesis'>(genesisSceneId);
  const [previousSceneId, setPreviousSceneId] = useState<number | null>(null);
  const [preloadedSlots, setPreloadedSlots] = useState<PreloadedSlotsData | null>(null);
  const [activeAttempts, setActiveAttempts] = useState<ActiveAttempt[]>([]);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [sceneHistory, setSceneHistory] = useState<SceneData[]>([]);
  const [showMapModal, setShowMapModal] = useState(false);

  // Signal to Base mini app that we're ready to display
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Load genesis scene data on mount so it can be added to history
  useEffect(() => {
    const loadGenesisScene = async () => {
      try {
        const response = await fetch(`/api/scenes/${genesisSceneId}`);
        if (response.ok) {
          const sceneData = await response.json();
          setCurrentScene({
            sceneId: sceneData.id,
            videoUrl: sceneData.videoUrl,
            slotLabel: sceneData.slotLabel || null,
            creatorAddress: sceneData.creatorAddress,
            creatorFid: sceneData.creatorFid,
            createdAt: sceneData.createdAt,
            movieSlug: movieSlug
          });
        }
      } catch (err) {
        console.error('Error loading genesis scene:', err);
      }
    };
    loadGenesisScene();
  }, [genesisSceneId, movieSlug]);

  // Check for active attempts when user connects wallet
  useEffect(() => {
    if (!address) {
      setActiveAttempts([]);
      setShowResumeBanner(false);
      return;
    }

    const checkActiveAttempts = async () => {
      try {
        const response = await fetch(`/api/user/active-attempts?address=${address}`);
        if (!response.ok) {
          console.error('Failed to fetch active attempts');
          return;
        }

        const data = await response.json();
        if (data.hasActiveAttempts && data.attempts.length > 0) {
          setActiveAttempts(data.attempts);
          setShowResumeBanner(true);
        } else {
          setActiveAttempts([]);
          setShowResumeBanner(false);
        }
      } catch (err) {
        console.error('Error checking active attempts:', err);
      }
    };

    checkActiveAttempts();
  }, [address]);

  // Preload slots for current scene when video starts playing
  useEffect(() => {
    if (!showVideo) {
      // Reset preloaded data when video is hidden
      setPreloadedSlots(null);
      return;
    }

    // Video is now playing - preload slots AND video URLs for instant playback
    const preloadSlots = async () => {
      try {
        // Fetch slots (always includes video URLs for completed slots)
        const response = await fetch(`/api/scenes/${parentSceneId}/slots`);
        if (!response.ok) {
          console.error('Failed to preload slots');
          return;
        }
        const data = await response.json();
        setPreloadedSlots(data);
      } catch (err) {
        console.error('Error preloading slots:', err);
      }
    };

    preloadSlots();
  }, [showVideo, parentSceneId]);

  const handleVideoEnd = () => {
    setShowPopup(true);
  };

  const handleSlotSelected = (sceneData: SceneData) => {
    // Hide modal
    setShowPopup(false);

    // Clear preloaded slots (will be refetched for new scene)
    setPreloadedSlots(null);

    // Track previous scene for analytics
    setPreviousSceneId(currentScene?.sceneId ?? null);

    // Push current scene to history before moving to new scene
    if (currentScene) {
      setSceneHistory(prev => [...prev, currentScene]);
    }

    // Set current scene data
    setCurrentScene(sceneData);

    // Show video
    setShowVideo(true);

    // Update parent scene ID for next modal (this triggers preload effect)
    setParentSceneId(sceneData.sceneId);
  };

  const handleBack = () => {
    // Pop the last scene from history
    if (sceneHistory.length === 0) {
      // Shouldn't happen - back button is hidden at genesis
      return;
    }

    const previousScene = sceneHistory[sceneHistory.length - 1];
    const newHistory = sceneHistory.slice(0, -1);

    // Clear preloaded slots
    setPreloadedSlots(null);

    // Update scene history
    setSceneHistory(newHistory);

    // Set the previous scene as current
    setCurrentScene(previousScene);

    // Update parent scene ID
    setParentSceneId(previousScene.sceneId);

    // Keep modal visible (don't hide it) and don't replay video
    // The modal will immediately show slot options for the previous scene
  };

  const handleSceneSelectFromMap = async (sceneId: number) => {
    // Close map modal
    setShowMapModal(false);

    // Close slot choice modal if open
    setShowPopup(false);

    // Special case: genesis scene ID, restart from beginning
    if (sceneId === genesisSceneId) {
      // Reset to genesis state
      setCurrentScene(null);
      setParentSceneId(genesisSceneId);
      setSceneHistory([]);
      setPreviousSceneId(null);
      setPreloadedSlots(null);
      setShowVideo(true);
      return;
    }

    try {
      // Fetch scene data
      const response = await fetch(`/api/scenes/${sceneId}`);
      if (!response.ok) {
        throw new Error('Failed to load scene');
      }

      const sceneData = await response.json();

      // Clear history (we're jumping, not navigating linearly)
      setSceneHistory([]);

      // Track previous scene for analytics
      setPreviousSceneId(currentScene?.sceneId ?? null);

      // Set current scene data
      setCurrentScene({
        sceneId: sceneData.id,
        videoUrl: sceneData.videoUrl,
        slotLabel: sceneData.slotLabel,
        creatorAddress: sceneData.creatorAddress,
        creatorFid: sceneData.creatorFid,
        createdAt: sceneData.createdAt,
        movieSlug: movieSlug
      });

      // Update parent scene ID for next modal
      setParentSceneId(sceneData.id);

      // Clear preloaded slots
      setPreloadedSlots(null);

      // Show video
      setShowVideo(true);
    } catch (err) {
      console.error('Error loading scene from map:', err);
      alert('Failed to load scene. Please try again.');
    }
  };

  return (
    <div className="flex justify-center items-center w-full h-full relative overflow-hidden bg-black">
      {/* Resume banner - shown when user has active attempts */}
      {showResumeBanner && activeAttempts.length > 0 && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[1001] rounded-xl px-6 py-4 backdrop-blur-md max-w-[500px]"
          style={{
            background: 'rgba(0, 255, 0, 0.15)',
            border: '2px solid rgba(0, 255, 0, 0.6)',
            animation: 'slideDown 0.3s ease-out'
          }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-[#0f0] font-saira text-sm font-bold m-0 mb-1">
                ✨ You have {activeAttempts.length} active scene{activeAttempts.length > 1 ? 's' : ''}
              </p>
              <p className="text-white/80 font-saira text-xs m-0">
                Slot {activeAttempts[0].slot} - {activeAttempts[0].resumePage === 'generating' ? 'Video generating...' : 'Enter your prompt'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push(activeAttempts[0].resumeUrl)}
                className="font-saira text-sm px-4 py-2 rounded-md cursor-pointer font-bold transition-all duration-200 hover:scale-105"
                style={{
                  background: 'rgba(0, 255, 0, 0.2)',
                  border: '1px solid rgba(0, 255, 0, 0.8)',
                  color: '#0f0',
                }}
              >
                Resume
              </button>
              <button
                onClick={() => setShowResumeBanner(false)}
                className="font-saira text-xs px-3 py-2 bg-white/10 border border-white/30 rounded-md text-white/70 cursor-pointer transition-all duration-200 hover:bg-white/20"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

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
        referrerSceneId={previousSceneId ?? undefined}
        createdAt={currentScene?.createdAt}
      />

      {/* Hidden video elements for pre-caching next scenes */}
      {showVideo && preloadedSlots?.slots && preloadedSlots.slots.map((slot) => {
        // Only pre-cache completed slots with video URLs
        if (slot.videoUrl && slot.status === 'completed') {
          return (
            <video
              key={`precache-${parentSceneId}-${slot.slot}`}
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
        parentSceneId={parentSceneId}
        movieSlug={movieSlug}
        onSlotSelected={handleSlotSelected}
        preloadedData={preloadedSlots}
        onBack={handleBack}
        canGoBack={sceneHistory.length > 0}
        backToLabel={null}
      />

      {/* Scene map modal */}
      <SceneMapModal
        isVisible={showMapModal}
        onClose={() => setShowMapModal(false)}
        onSceneSelect={handleSceneSelectFromMap}
        currentSceneId={currentScene?.sceneId ?? null}
      />
    </div>
  );
}
