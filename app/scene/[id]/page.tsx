"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect
} from "@coinbase/onchainkit/wallet";
import {
  Avatar,
  Name,
  Identity,
  Address
} from "@coinbase/onchainkit/identity";
import Video from "../../components/Video";
import SlotChoiceModal from "../../components/SlotChoiceModal";
import type { SceneData, PreloadedSlotsData } from "@/lib/types";

export default function ScenePage() {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const sceneId = params.id as string;

  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [preloadedSlots, setPreloadedSlots] = useState<PreloadedSlotsData | null>(null);
  const [sceneHistory, setSceneHistory] = useState<SceneData[]>([]);
  const [currentScene, setCurrentScene] = useState<SceneData | null>(null);

  // Load scene data
  useEffect(() => {
    const loadScene = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/scenes/${sceneId}`);

        if (!response.ok) {
          throw new Error('Failed to load scene');
        }

        const data = await response.json();
        setSceneData(data);
        setCurrentScene(data);
        setShowVideo(true);
      } catch (err) {
        console.error('Error loading scene:', err);
        setError('Failed to load scene. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadScene();
  }, [sceneId]);

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
      // Go back to home if no history
      router.push('/');
      return;
    }

    const previousScene = sceneHistory[sceneHistory.length - 1];
    const newHistory = sceneHistory.slice(0, -1);

    setPreloadedSlots(null);
    setSceneHistory(newHistory);
    setCurrentScene(previousScene);
    // Keep modal visible and don't replay video
    // Modal will immediately show slot options for previous scene
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-full h-full relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white font-source-code text-center">
          <p>Loading scene...</p>
        </div>
      </div>
    );
  }

  if (error || !sceneData) {
    return (
      <div className="flex justify-center items-center w-full h-full relative overflow-hidden">
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
    <div className="flex justify-center items-center w-full h-full relative overflow-hidden">
      {/* Wallet connection in top right */}
      <div className="absolute top-5 right-5 z-[1000]">
        <Wallet>
          <ConnectWallet>
            <Avatar className="h-6 w-6" />
            <Name />
          </ConnectWallet>
          <WalletDropdown>
            <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
              <Avatar />
              <Name />
              <Address />
            </Identity>
            <WalletDropdownDisconnect />
          </WalletDropdown>
        </Wallet>
      </div>

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
        movieSlug={sceneData?.movieSlug || '2009'}
        onSlotSelected={handleSlotSelected}
        preloadedData={preloadedSlots}
        onBack={handleBack}
        canGoBack={currentScene !== null}
        backToLabel={sceneHistory.length > 0 ? sceneHistory[sceneHistory.length - 1].slotLabel : null}
      />
    </div>
  );
}
