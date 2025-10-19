"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
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
import Countdown from "./Countdown";
import Video from "./Video";
import SlotChoiceModal from "./SlotChoiceModal";
import styles from "./MainGame.module.css";

interface SceneData {
  sceneId: number;
  videoUrl: string;
  slotLabel: string | null;
  creatorAddress: string | null;
  creatorFid: number | null;
  createdAt: string;
}

interface SlotInfo {
  slot: 'A' | 'B' | 'C';
  exists: boolean;
  sceneId: number | null;
  label: string | null;
  status: string | null;
  isLocked: boolean;
  lockedBy: string | null;
  lockedUntil: Date | null;
}

interface PreloadedSlotsData {
  slots: SlotInfo[];
}

export default function MainGame() {
  const { address } = useAccount(); // Get connected wallet address
  const { isFrameReady, setFrameReady } = useMiniKit(); // Base mini app initialization
  const [showVideo, setShowVideo] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [currentScene, setCurrentScene] = useState<SceneData | null>(null);
  const [parentSceneId, setParentSceneId] = useState<number | 'genesis'>('genesis');
  const [previousSceneId, setPreviousSceneId] = useState<number | null>(null);
  const [preloadedSlots, setPreloadedSlots] = useState<PreloadedSlotsData | null>(null);

  // Background animation state
  const [bgScale, setBgScale] = useState(1);
  const [bgOpacity, setBgOpacity] = useState(1);
  const startTimeRef = useRef<number>(0);
  const TOTAL_DURATION = 2500; // Match countdown duration (must match Countdown.tsx)

  // Signal to Base mini app that we're ready to display
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Initialize start time for background animation
  useEffect(() => {
    if (!showVideo) {
      startTimeRef.current = performance.now();
    }
  }, [showVideo]);

  // Animate background scale and opacity
  useEffect(() => {
    if (showVideo) return; // Stop animation when video starts

    let animationFrameId: number;

    const updateBackground = () => {
      const elapsed = performance.now() - startTimeRef.current;
      const progress = Math.min(elapsed / TOTAL_DURATION, 1);

      // Scale from 1.0 to 1.8 (gets bigger)
      const newScale = 1 + (progress * 0.8);
      setBgScale(newScale);

      // Fade out from 1 to 0
      const newOpacity = 1 - progress;
      setBgOpacity(newOpacity);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(updateBackground);
      }
    };

    animationFrameId = requestAnimationFrame(updateBackground);

    return () => cancelAnimationFrame(animationFrameId);
  }, [showVideo, TOTAL_DURATION]);

  // Preload slots for current scene when video starts playing
  useEffect(() => {
    if (!showVideo) {
      // Reset preloaded data when video is hidden
      setPreloadedSlots(null);
      return;
    }

    // Video is now playing - preload slots for the modal that will appear when video ends
    const preloadSlots = async () => {
      try {
        const response = await fetch(`/api/scenes/${parentSceneId}/slots`);
        if (!response.ok) {
          console.error('Failed to preload slots');
          return;
        }
        const data = await response.json();
        setPreloadedSlots(data);
        console.log('✅ Slots preloaded during video playback', data);
      } catch (err) {
        console.error('Error preloading slots:', err);
      }
    };

    preloadSlots();
  }, [showVideo, parentSceneId]);

  const handleCountdownComplete = () => {
    setShowVideo(true);
  };

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

    // Set current scene data
    setCurrentScene(sceneData);

    // Show video
    setShowVideo(true);

    // Update parent scene ID for next modal (this triggers preload effect)
    setParentSceneId(sceneData.sceneId);
  };

  return (
    <div className={styles.container}>
      {/* Animated background image */}
      {!showVideo && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage: 'url(/loading.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            transform: `scale(${bgScale})`,
            opacity: bgOpacity,
            transition: 'transform 0.016s linear, opacity 0.016s linear',
            zIndex: 0,
          }}
        />
      )}

      {/* Wallet connection in top right */}
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 1000 }}>
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
        referrerSceneId={previousSceneId ?? undefined}
      />

      {/* Countdown animation */}
      {!showVideo && <Countdown onComplete={handleCountdownComplete} />}

      {/* Slot choice modal */}
      <SlotChoiceModal
        isVisible={showPopup}
        parentSceneId={parentSceneId}
        onSlotSelected={handleSlotSelected}
        preloadedData={preloadedSlots}
      />
    </div>
  );
}
