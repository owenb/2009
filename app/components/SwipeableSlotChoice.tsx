"use client";

import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import VideoAdventureABI from "../../lib/VideoAdventure.abi.json";
import ExtendStoryModal from "./ExtendStoryModal";
import AboutModal from "./AboutModal";
import SceneMapModal from "./SceneMapModal";
import type { SlotInfo } from "@/lib/db/types";
import type { SceneData } from "@/lib/types";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const SCENE_PRICE = process.env.NEXT_PUBLIC_SCENE_PRICE || "0.000056";

// Swipe thresholds - optimized for snappy, responsive feel
const SWIPE_THRESHOLD = 60; // px - reduced for quicker response
const _MIN_SWIPE_DISTANCE = 20; // px - minimum to start visual feedback (reserved for future use)
const VELOCITY_THRESHOLD = 0.5; // px/ms - increased for more responsive flicks

type SwipeDirection = 'left' | 'right' | 'up' | 'down' | null;

interface SwipeableSlotChoiceProps {
  isVisible: boolean;
  parentSceneId?: number | 'genesis';
  movieSlug: string;
  onSlotSelected?: (sceneData: SceneData) => void;
  preloadedData?: { slots: SlotInfo[] } | null;
  onBack?: () => void;
  canGoBack?: boolean;
  backToLabel?: string | null; // Label of the scene we're going back to
}

export default function SwipeableSlotChoice({
  isVisible,
  parentSceneId = 'genesis',
  movieSlug,
  onSlotSelected,
  preloadedData,
  onBack,
  canGoBack = false,
  backToLabel = null
}: SwipeableSlotChoiceProps) {
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lockSceneId, setLockSceneId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [loadingSlot, setLoadingSlot] = useState<'A' | 'B' | 'C' | null>(null);

  // Swipe state
  const [isDragging, setIsDragging] = useState(false);
  const [_dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);

  const dragStartRef = useRef({ x: 0, y: 0, time: 0 });
  const _cardRef = useRef<HTMLDivElement>(null);

  // ExtendStoryModal state
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [pendingSlot, setPendingSlot] = useState<{ slot: 'A' | 'B' | 'C', index: number } | null>(null);

  // AboutModal state
  const [showAboutModal, setShowAboutModal] = useState(false);

  // SceneMapModal state
  const [showMapModal, setShowMapModal] = useState(false);

  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Reset loading state when modal is hidden
  useEffect(() => {
    if (!isVisible) {
      setLoadingSlot(null);
      setIsDragging(false);
      setDragOffset({ x: 0, y: 0 });
      setSwipeDirection(null);
    }
  }, [isVisible]);

  // Fetch slots when modal becomes visible (or use preloaded data)
  useEffect(() => {
    if (!isVisible) return;

    if (preloadedData?.slots) {
      setSlots(preloadedData.slots);
      setIsLoading(false);
      setLoadError(null);
      return;
    }

    const fetchSlots = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(`/api/scenes/${parentSceneId}/slots`);

        if (!response.ok) {
          throw new Error('Failed to fetch slots');
        }

        const data = await response.json();
        setSlots(data.slots);
      } catch (err) {
        console.error('Error fetching slots:', err);
        setLoadError('Failed to load slots. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSlots();
  }, [isVisible, parentSceneId, preloadedData]);

  // Map slots to swipe directions
  const directionMap = {
    left: slots.find(s => s.slot === 'A') || null,
    right: slots.find(s => s.slot === 'B') || null,
    down: slots.find(s => s.slot === 'C') || null,
    up: null // Reserved for back navigation
  };

  // Determine slot state and action
  const getSlotState = (slotInfo: SlotInfo) => {
    // Filled slot (exists and completed)
    if (slotInfo.exists && slotInfo.status === 'completed') {
      return {
        type: 'filled' as const,
        canInteract: isConnected,
        label: slotInfo.label || 'view scene',
        action: () => handleFilledSlotClick(slotInfo.slot)
      };
    }

    // Own attempt (not completed)
    const isOwnAttempt = !!(
      slotInfo.attemptId &&
      slotInfo.attemptCreator &&
      address &&
      slotInfo.attemptCreator.toLowerCase() === address.toLowerCase()
    );

    if (isOwnAttempt) {
      const hasActivePrompt = slotInfo.latestPromptId &&
        (slotInfo.latestPromptOutcome === 'pending' || slotInfo.latestPromptOutcome === 'generating');

      return {
        type: 'own' as const,
        canInteract: true,
        label: hasActivePrompt ? 'view generation' : 'resume your scene',
        sublabel: hasActivePrompt ? 'video generating...' : 'you paid for this',
        action: () => handleResumeSlot(
          slotInfo.attemptId!,
          slotInfo.sceneId!,
          slotInfo.latestPromptId,
          slotInfo.latestPromptOutcome
        )
      };
    }

    // Someone else's attempt or locked
    if (slotInfo.attemptId || slotInfo.isLocked ||
        slotInfo.status === 'locked' ||
        slotInfo.status === 'verifying_payment' ||
        slotInfo.status === 'awaiting_prompt' ||
        slotInfo.status === 'generating') {
      return {
        type: 'locked' as const,
        canInteract: false,
        label: 'being created...',
        action: null
      };
    }

    // Empty/available slot
    const slotIndex = slotInfo.slot.charCodeAt(0) - 'A'.charCodeAt(0);
    return {
      type: 'empty' as const,
      canInteract: isConnected && !isPending && !isConfirming,
      label: 'extend this story',
      action: () => handleSlotClick(slotInfo.slot, slotIndex)
    };
  };

  // Handle clicking a filled slot (to play the scene)
  const handleFilledSlotClick = async (slot: 'A' | 'B' | 'C') => {
    if (!isConnected || !address) {
      alert("Please connect your wallet to continue watching!");
      return;
    }

    try {
      const cachedSlot = slots.find(s => s.slot === slot);
      const hasCachedVideo = !!cachedSlot?.videoUrl;

      if (!hasCachedVideo) {
        setLoadingSlot(slot);
      }

      const response = await fetch('/api/play', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parentSceneId,
          slot,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to load scene');
      }

      const sceneData = await response.json();

      if (hasCachedVideo && cachedSlot) {
        sceneData.videoUrl = cachedSlot.videoUrl;
      }

      if (onSlotSelected) {
        onSlotSelected(sceneData);
      }
    } catch (err) {
      console.error('Error loading scene:', err);
      alert('Failed to load scene. Please try again.');
      setLoadingSlot(null);
    }
  };

  // Handle clicking own paid slot (resume generation)
  const handleResumeSlot = (
    attemptId: number,
    sceneId: number,
    promptId: number | null,
    promptOutcome: string | null
  ) => {
    const hasActivePrompt = promptId && (promptOutcome === 'pending' || promptOutcome === 'generating');

    if (hasActivePrompt) {
      router.push(`/movie/${movieSlug}/generating?promptId=${promptId}&sceneId=${sceneId}`);
    } else {
      router.push(`/movie/${movieSlug}/create?attemptId=${attemptId}&sceneId=${sceneId}`);
    }
  };

  // Handle empty slot click - show ExtendStoryModal first
  const handleSlotClick = async (slot: 'A' | 'B' | 'C', slotIndex: number) => {
    if (!isConnected || !address) {
      alert("Please connect your wallet first!");
      return;
    }

    setPendingSlot({ slot, index: slotIndex });
    setShowExtendModal(true);
  };

  // Handle closing ExtendStoryModal (cancel)
  const handleCloseExtendModal = () => {
    setShowExtendModal(false);
    setPendingSlot(null);
  };

  // Handle confirmed slot extension
  const handleConfirmExtend = async () => {
    if (!pendingSlot || !isConnected || !address) return;

    const { slot, index: slotIndex } = pendingSlot;

    setShowExtendModal(false);
    setPendingSlot(null);

    if (isPending || isConfirming) {
      return;
    }

    setStatusMessage('Reserving slot...');

    try {
      const lockResponse = await fetch(`/api/scenes/${parentSceneId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot,
          userAddress: address,
          fid: undefined
        })
      });

      if (!lockResponse.ok) {
        const error = await lockResponse.json();
        alert(error.error || 'Failed to acquire lock');
        setStatusMessage('');
        return;
      }

      const lockData = await lockResponse.json();
      setLockSceneId(lockData.sceneId);
      setStatusMessage('Lock acquired! Please confirm transaction...');

      const numericParentId = parentSceneId === 'genesis' ? 0 : Number(parentSceneId);

      writeContract({
        address: CONTRACT_ADDRESS,
        abi: VideoAdventureABI,
        functionName: "claimSlot",
        args: [BigInt(numericParentId), slotIndex],
        value: parseEther(SCENE_PRICE),
      });

    } catch (error) {
      console.error('Error acquiring lock:', error);
      alert('Failed to acquire lock. Please try again.');
      setStatusMessage('');
    }
  };

  // Verify payment after transaction confirms
  useEffect(() => {
    if (!isConfirmed || !hash || !lockSceneId || !address) return;

    const verifyPayment = async () => {
      setStatusMessage('Verifying payment...');

      try {
        const response = await fetch('/api/scenes/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sceneId: lockSceneId,
            transactionHash: hash,
            userAddress: address,
            fid: undefined
          })
        });

        if (!response.ok) {
          const error = await response.json();
          alert(error.error || 'Payment verification failed');
          setStatusMessage('');
          return;
        }

        const data = await response.json();
        setStatusMessage('Payment verified! Redirecting...');

        setTimeout(() => {
          router.push(`/movie/${movieSlug}/create?attemptId=${data.attemptId}&sceneId=${lockSceneId}`);
        }, 1000);

      } catch (error) {
        console.error('Error verifying payment:', error);
        alert('Payment verification failed. Please contact support.');
        setStatusMessage('');
      }
    };

    verifyPayment();
  }, [isConfirmed, hash, lockSceneId, address, router, movieSlug]);

  // Show transaction error
  useEffect(() => {
    if (error) {
      console.error("Transaction error:", error);
      alert(`Transaction failed: ${error.message}`);
      setStatusMessage('');
    }
  }, [error]);

  // Gesture handlers
  const handleDragStart = (clientX: number, clientY: number) => {
    // Allow dragging - we'll check slot state on swipe complete
    setIsDragging(true);
    dragStartRef.current = { x: clientX, y: clientY, time: Date.now() };
    setDragOffset({ x: 0, y: 0 });
    setSwipeDirection(null);
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;

    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;

    setDragOffset({ x: deltaX, y: deltaY });

    // Determine dominant direction
    // Horizontal: invert to match standard mobile UX (swipe left reveals right content)
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      setSwipeDirection(deltaX > 0 ? 'left' : 'right');
    } else {
      setSwipeDirection(deltaY > 0 ? 'down' : 'up');
    }
  };

  const handleDragEnd = (clientX: number, clientY: number) => {
    if (!isDragging) return;

    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;
    const deltaTime = Date.now() - dragStartRef.current.time;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const velocity = distance / deltaTime;

    setIsDragging(false);

    // Check if swipe threshold met
    const thresholdMet = distance > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD;

    if (thresholdMet && swipeDirection) {
      handleSwipeComplete(swipeDirection);
    } else {
      // Snap back
      setDragOffset({ x: 0, y: 0 });
      setSwipeDirection(null);
    }
  };

  const handleSwipeComplete = (direction: SwipeDirection) => {
    if (!direction) return;

    // Handle back gesture
    if (direction === 'up') {
      if (onBack && canGoBack) {
        onBack();
      }
      setDragOffset({ x: 0, y: 0 });
      setSwipeDirection(null);
      return;
    }

    // Get the slot for this direction
    const targetSlot = directionMap[direction as 'left' | 'right' | 'down'];
    if (!targetSlot) {
      // No slot mapped to this direction, just reset
      setDragOffset({ x: 0, y: 0 });
      setSwipeDirection(null);
      return;
    }

    // Handle slot interaction
    const slotState = getSlotState(targetSlot);
    if (slotState.canInteract && slotState.action) {
      slotState.action();
    }

    // Reset
    setDragOffset({ x: 0, y: 0 });
    setSwipeDirection(null);
  };

  // Handle direct clicks on direction indicators
  const handleDirectionClick = (direction: 'left' | 'right' | 'down' | 'up') => {
    // Prevent clicks during active drag
    if (isDragging) return;

    handleSwipeComplete(direction);
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragMove(touch.clientX, touch.clientY);
    e.preventDefault(); // Prevent page scroll
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    handleDragEnd(touch.clientX, touch.clientY);
  };

  // Mouse events (for desktop/tablet)
  const handleMouseDown = (e: React.MouseEvent) => {
    handleDragStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientX, e.clientY);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    handleDragEnd(e.clientX, e.clientY);
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);
      setDragOffset({ x: 0, y: 0 });
      setSwipeDirection(null);
    }
  };

  if (!isVisible) return null;

  // Helper to render a directional label
  const renderDirectionLabel = (direction: 'left' | 'right' | 'down', slot: SlotInfo | null) => {
    if (!slot) return null;

    const slotState = getSlotState(slot);
    const isHighlighted = swipeDirection === direction;
    const isLoading = loadingSlot === slot.slot;

    // Get display label based on state
    let displayLabel = slotState.label;
    if (isLoading) displayLabel = 'loading...';

    // Get indicator emoji based on state
    let indicator = '';
    if (slotState.type === 'locked') indicator = '🔒 ';
    else if (slotState.type === 'own') indicator = '✨ ';
    else if (!slotState.canInteract) indicator = '⏸ ';

    // Determine if this is an available slot (empty and can interact)
    const isAvailable = slotState.type === 'empty' && slotState.canInteract;

    return (
      <div className={`font-source-code transition-all duration-200 ${isHighlighted ? 'text-white scale-105' : slotState.canInteract ? 'text-white' : 'text-white/40'}`}>
        <div className={`flex flex-col items-center max-w-[200px] sm:max-w-[160px] relative px-3 py-2 rounded-lg ${isAvailable ? 'bg-black/60' : 'bg-black/40'} backdrop-blur-sm`}>
          {/* Available slot background highlight */}
          {isAvailable && (
            <div className="absolute inset-0 bg-[var(--movie-primary,#FFD700)] opacity-20 rounded-lg blur-sm" />
          )}
          {/* Label - centered with text-balance */}
          <div
            className={`text-[1rem] font-bold leading-tight text-center relative z-10 sm:text-[0.85rem] ${isAvailable ? 'text-[var(--movie-primary,#FFD700)]' : ''}`}
            style={{ textWrap: 'balance' } as React.CSSProperties}
          >
            {indicator}{displayLabel}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center z-10 pointer-events-none">
      {/* Darkening overlay that fades in */}
      <div className="absolute inset-0 bg-black/60 animate-fade-in pointer-events-none" />

      <div
        className="relative w-full h-full flex items-center justify-center pointer-events-auto"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'none' }}
      >
        {/* Status messages */}
        {!isConnected && (
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-20 w-[90%] max-w-[400px]">
            <div className="rounded-lg p-3 text-center bg-[rgba(255,215,0,0.2)] border-2 border-[rgba(255,215,0,0.5)]">
              <p className="text-[#FFD700] font-bold text-sm font-source-code m-0">
                🔒 Wallet Connection Required
              </p>
            </div>
          </div>
        )}

        {statusMessage && (
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-20">
            <p className="text-[#FFD700] font-source-code text-sm">
              {statusMessage}
            </p>
          </div>
        )}

        {isPending && (
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-20">
            <p className="text-[#FFD700] font-source-code text-sm">
              Waiting for wallet confirmation...
            </p>
          </div>
        )}

        {isConfirming && (
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-20">
            <p className="text-[#FFD700] font-source-code text-sm">
              Transaction pending on Base...
            </p>
          </div>
        )}

        {loadError && (
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-20">
            <p className="text-[#FF6B6B] font-source-code text-sm">
              {loadError}
            </p>
          </div>
        )}

        {isLoading ? (
          <p className="text-white font-source-code">Loading slots...</p>
        ) : (
          <>
            {/* Up direction - Back button (only show if canGoBack) */}
            {canGoBack && (
              <div
                className="absolute top-[8%] left-1/2 transform -translate-x-1/2 z-10 pointer-events-auto cursor-pointer"
                onClick={() => handleDirectionClick('up')}
              >
                <div className="font-source-code transition-all duration-200">
                  <div className="flex flex-col items-center px-4 py-2 rounded-lg bg-black/60 backdrop-blur-sm">
                    <div className={`text-3xl mb-1 sm:text-2xl transition-all duration-200 ${swipeDirection === 'up' ? 'scale-110 text-white' : 'text-white hover:text-white'}`}>↑</div>
                    <div
                      className="text-sm sm:text-xs text-center text-white"
                      style={{ textWrap: 'balance' } as React.CSSProperties}
                    >
                      {backToLabel ? `Back to ${backToLabel}` : 'Go back'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Left direction - Slot A */}
            {directionMap.left && (() => {
              const slotState = getSlotState(directionMap.left);
              const isAvailable = slotState.type === 'empty' && slotState.canInteract;
              return (
                <div
                  className={`absolute left-[5%] top-1/2 transform -translate-y-1/2 z-10 ${slotState.canInteract ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
                  onClick={() => slotState.canInteract && handleDirectionClick('left')}
                >
                  <div className={`flex flex-col items-center gap-2 ${slotState.canInteract ? 'hover:scale-105' : ''} transition-transform duration-200`}>
                    <div className={`text-4xl transition-all duration-200 ${swipeDirection === 'left' ? 'scale-110 text-white' : isAvailable ? 'text-[var(--movie-primary,#FFD700)]' : 'text-white/60'} sm:text-3xl`}>←</div>
                    {renderDirectionLabel('left', directionMap.left)}
                  </div>
                </div>
              );
            })()}

            {/* Right direction - Slot B */}
            {directionMap.right && (() => {
              const slotState = getSlotState(directionMap.right);
              const isAvailable = slotState.type === 'empty' && slotState.canInteract;
              return (
                <div
                  className={`absolute right-[5%] top-1/2 transform -translate-y-1/2 z-10 ${slotState.canInteract ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
                  onClick={() => slotState.canInteract && handleDirectionClick('right')}
                >
                  <div className={`flex flex-col items-center gap-2 ${slotState.canInteract ? 'hover:scale-105' : ''} transition-transform duration-200`}>
                    <div className={`text-4xl transition-all duration-200 ${swipeDirection === 'right' ? 'scale-110 text-white' : isAvailable ? 'text-[var(--movie-primary,#FFD700)]' : 'text-white/60'} sm:text-3xl`}>→</div>
                    {renderDirectionLabel('right', directionMap.right)}
                  </div>
                </div>
              );
            })()}

            {/* Down direction - Slot C */}
            {directionMap.down && (() => {
              const slotState = getSlotState(directionMap.down);
              const isAvailable = slotState.type === 'empty' && slotState.canInteract;
              return (
                <div
                  className={`absolute bottom-[8%] left-1/2 transform -translate-x-1/2 z-10 ${slotState.canInteract ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
                  onClick={() => slotState.canInteract && handleDirectionClick('down')}
                >
                  <div className={`flex flex-col items-center gap-2 ${slotState.canInteract ? 'hover:scale-105' : ''} transition-transform duration-200`}>
                    {renderDirectionLabel('down', directionMap.down)}
                    <div className={`text-4xl transition-all duration-200 ${swipeDirection === 'down' ? 'scale-110 text-white' : isAvailable ? 'text-[var(--movie-primary,#FFD700)]' : 'text-white/60'} sm:text-3xl`}>↓</div>
                  </div>
                </div>
              );
            })()}

           
          </>
        )}

        {/* Footer with Map and About */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-4 z-20 pb-[env(safe-area-inset-bottom)]">
          <button
            onClick={() => setShowMapModal(true)}
            className="font-source-code text-sm text-white/60 bg-transparent border-none cursor-pointer no-underline transition-colors duration-200 p-0 flex items-center gap-1 hover:text-white/90"
          >
            <span>Story map</span>
          </button>

          <button
            onClick={() => setShowAboutModal(true)}
            className="font-source-code text-sm text-white/60 bg-transparent border-none cursor-pointer no-underline transition-colors duration-200 p-0 hover:text-white/90"
          >
            About this game
          </button>
        </div>
      </div>

      {/* ExtendStoryModal */}
      {pendingSlot && (
        <ExtendStoryModal
          isVisible={showExtendModal}
          slot={pendingSlot.slot}
          onExtendClick={handleConfirmExtend}
          onClose={handleCloseExtendModal}
        />
      )}

      {/* AboutModal */}
      <AboutModal
        isVisible={showAboutModal}
        onClose={() => setShowAboutModal(false)}
      />

      {/* SceneMapModal */}
      <SceneMapModal
        isVisible={showMapModal}
        onClose={() => setShowMapModal(false)}
        onSceneSelect={(sceneId) => {
          setShowMapModal(false);
          if (sceneId === 0) {
            window.location.reload();
          } else {
            window.location.href = `/scene/${sceneId}`;
          }
        }}
        currentSceneId={null}
      />
    </div>
  );
}
