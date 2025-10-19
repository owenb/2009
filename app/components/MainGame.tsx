"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useRouter } from "next/navigation";
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
  attemptId: number | null;
  attemptCreator: string | null;
  expiresAt: Date | null;
  latestPromptId: number | null;
  latestPromptOutcome: string | null;
}

interface PreloadedSlotsData {
  slots: SlotInfo[];
}

interface ActiveAttempt {
  attemptId: number;
  sceneId: number;
  parentId: number | null;
  slot: string;
  expiresAt: string;
  timeRemainingMs: number;
  latestPromptId: number | null;
  latestPromptOutcome: string | null;
  resumePage: 'create' | 'generating';
  resumeUrl: string;
}

export default function MainGame() {
  const { address } = useAccount(); // Get connected wallet address
  const { isFrameReady, setFrameReady } = useMiniKit(); // Base mini app initialization
  const router = useRouter();
  const [showVideo, setShowVideo] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [currentScene, setCurrentScene] = useState<SceneData | null>(null);
  const [parentSceneId, setParentSceneId] = useState<number | 'genesis'>('genesis');
  const [previousSceneId, setPreviousSceneId] = useState<number | null>(null);
  const [preloadedSlots, setPreloadedSlots] = useState<PreloadedSlotsData | null>(null);
  const [activeAttempts, setActiveAttempts] = useState<ActiveAttempt[]>([]);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [sceneHistory, setSceneHistory] = useState<SceneData[]>([]);

  // Background animation state
  const [bgScale, setBgScale] = useState(1);
  const [bgOpacity, setBgOpacity] = useState(1);
  const startTimeRef = useRef<number>(0);
  const TOTAL_DURATION = 2500; // Match countdown duration (must match Countdown.tsx)

  // Wallet visibility state
  const [walletVisible, setWalletVisible] = useState(true);
  const [walletOpacity, setWalletOpacity] = useState(1);

  // Signal to Base mini app that we're ready to display
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Fade out wallet after connection
  useEffect(() => {
    if (!address) {
      // User not connected - keep wallet visible
      setWalletVisible(true);
      setWalletOpacity(1);
      return;
    }

    // User just connected - show for 3 seconds then fade out
    setWalletVisible(true);
    setWalletOpacity(1);

    const fadeTimer = setTimeout(() => {
      setWalletOpacity(0);
    }, 3000);

    const hideTimer = setTimeout(() => {
      setWalletVisible(false);
    }, 4000); // Extra 1 second for fade transition

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [address]);

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
          console.log('✨ Found active attempts:', data.attempts);
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
    if (sceneHistory.length === 0) return;

    const previousScene = sceneHistory[sceneHistory.length - 1];
    const newHistory = sceneHistory.slice(0, -1);

    // Hide modal
    setShowPopup(false);

    // Clear preloaded slots
    setPreloadedSlots(null);

    // Update scene history
    setSceneHistory(newHistory);

    // Set the previous scene as current
    setCurrentScene(previousScene);

    // Update parent scene ID
    setParentSceneId(previousScene.sceneId);

    // Show video
    setShowVideo(true);
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

      {/* Resume banner - shown when user has active attempts */}
      {showResumeBanner && activeAttempts.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1001,
          background: 'rgba(0, 255, 0, 0.15)',
          border: '2px solid rgba(0, 255, 0, 0.6)',
          borderRadius: '12px',
          padding: '1rem 1.5rem',
          backdropFilter: 'blur(10px)',
          maxWidth: '500px',
          animation: 'slideDown 0.3s ease-out'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div style={{ flex: 1 }}>
              <p style={{
                color: '#0f0',
                fontFamily: 'var(--font-source-code-pro)',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                margin: 0,
                marginBottom: '0.25rem'
              }}>
                ✨ You have {activeAttempts.length} active scene{activeAttempts.length > 1 ? 's' : ''}
              </p>
              <p style={{
                color: 'rgba(255, 255, 255, 0.8)',
                fontFamily: 'var(--font-source-code-pro)',
                fontSize: '0.75rem',
                margin: 0
              }}>
                Slot {activeAttempts[0].slot} - {activeAttempts[0].resumePage === 'generating' ? 'Video generating...' : 'Enter your prompt'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => router.push(activeAttempts[0].resumeUrl)}
                style={{
                  fontFamily: 'var(--font-source-code-pro)',
                  fontSize: '0.85rem',
                  padding: '0.5rem 1rem',
                  background: 'rgba(0, 255, 0, 0.2)',
                  border: '1px solid rgba(0, 255, 0, 0.8)',
                  borderRadius: '6px',
                  color: '#0f0',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 255, 0, 0.3)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 255, 0, 0.2)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                Resume
              </button>
              <button
                onClick={() => setShowResumeBanner(false)}
                style={{
                  fontFamily: 'var(--font-source-code-pro)',
                  fontSize: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '6px',
                  color: 'rgba(255, 255, 255, 0.7)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet connection in top right */}
      {walletVisible && (
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          opacity: walletOpacity,
          transition: 'opacity 1s ease-out',
          pointerEvents: walletOpacity === 0 ? 'none' : 'auto'
        }}>
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

      {/* Countdown animation */}
      {!showVideo && <Countdown onComplete={handleCountdownComplete} />}

      {/* Slot choice modal */}
      <SlotChoiceModal
        isVisible={showPopup}
        parentSceneId={parentSceneId}
        onSlotSelected={handleSlotSelected}
        preloadedData={preloadedSlots}
        onBack={handleBack}
        canGoBack={sceneHistory.length > 0}
      />
    </div>
  );
}
