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

// Swipe thresholds - allow preview before snap
const SWIPE_THRESHOLD = 120; // px - increased to allow more preview before snap
const _MIN_SWIPE_DISTANCE = 20; // px - minimum to start visual feedback (reserved for future use)
const VELOCITY_THRESHOLD = 0.8; // px/ms - increased to require more intent

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
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);

  const dragStartRef = useRef({ x: 0, y: 0, time: 0 });

  // Video preview refs for each direction
  const leftVideoRef = useRef<HTMLVideoElement>(null);
  const rightVideoRef = useRef<HTMLVideoElement>(null);
  const downVideoRef = useRef<HTMLVideoElement>(null);

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

      // Pause and reset preview videos
      if (leftVideoRef.current) {
        leftVideoRef.current.pause();
        leftVideoRef.current.currentTime = 0;
      }
      if (rightVideoRef.current) {
        rightVideoRef.current.pause();
        rightVideoRef.current.currentTime = 0;
      }
      if (downVideoRef.current) {
        downVideoRef.current.pause();
        downVideoRef.current.currentTime = 0;
      }
    }
  }, [isVisible]);

  // Load and pause preview videos when modal becomes visible
  useEffect(() => {
    if (!isVisible) return;

    // Small delay to ensure videos are loaded
    const timer = setTimeout(() => {
      [leftVideoRef, rightVideoRef, downVideoRef].forEach(ref => {
        if (ref.current) {
          ref.current.load();
          ref.current.currentTime = 0;
          // Pause immediately to show first frame
          ref.current.pause();
        }
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [isVisible, slots]);

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

  // Map slots to swipe directions (all inverted for natural mobile UX)
  // Swipe left → reveals content from RIGHT (slot A positioned right)
  // Swipe right → reveals content from LEFT (slot B positioned left)
  // Swipe up → reveals content from BOTTOM (slot C positioned bottom)
  // Swipe down → reveals content from TOP (back navigation positioned top)
  const directionMap = {
    left: slots.find(s => s.slot === 'A') || null,  // Positioned RIGHT
    right: slots.find(s => s.slot === 'B') || null, // Positioned LEFT
    down: slots.find(s => s.slot === 'C') || null,  // Positioned BOTTOM
    up: null // Back navigation (positioned TOP)
  };

  // Determine which empty slot should be available (sequential unlocking)
  const getFirstAvailableEmptySlot = (): 'A' | 'B' | 'C' | null => {
    const slotOrder: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];

    for (const slotLetter of slotOrder) {
      const slot = slots.find(s => s.slot === slotLetter);
      if (!slot) continue;

      // Check if this slot is truly empty (no attempts, not locked, not completed)
      const isEmpty = !slot.exists &&
                      !slot.attemptId &&
                      !slot.isLocked &&
                      slot.status !== 'locked' &&
                      slot.status !== 'verifying_payment' &&
                      slot.status !== 'awaiting_prompt' &&
                      slot.status !== 'generating' &&
                      slot.status !== 'completed';

      if (isEmpty) {
        return slotLetter; // This is the first empty slot
      }
    }

    return null; // All slots are taken
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

    // Empty slot - check if this is the first available one
    const firstAvailableSlot = getFirstAvailableEmptySlot();
    const isThisSlotAvailable = firstAvailableSlot === slotInfo.slot;

    if (!isThisSlotAvailable) {
      // This slot is empty but not yet available (earlier slots must be filled first)
      return {
        type: 'locked' as const,
        canInteract: false,
        label: 'not yet available',
        action: null
      };
    }

    // This is the first available empty slot
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
    // ALL gestures inverted to match mobile UX (swipe reveals content from that direction)
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal: swipe left reveals right content (slot B), swipe right reveals left content (slot A)
      setSwipeDirection(deltaX > 0 ? 'left' : 'right');
    } else {
      // Vertical: swipe down reveals top content (go back), swipe up reveals bottom content (slot C)
      setSwipeDirection(deltaY > 0 ? 'up' : 'down');
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

    // Handle back gesture (swipe down = go back up tree)
    if (direction === 'up') {
      if (onBack && canGoBack) {
        onBack();
      }
      setDragOffset({ x: 0, y: 0 });
      setSwipeDirection(null);
      return;
    }

    // Get the slot for this direction (left, right, or down)
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

  // Helper to render video preview
  const renderVideoPreview = (
    direction: 'left' | 'right' | 'down',
    slot: SlotInfo | null,
    videoRef: React.RefObject<HTMLVideoElement | null>
  ) => {
    if (!slot?.videoUrl || slot.status !== 'completed') {
      return null;
    }

    // Simpler, more aggressive reveal calculation
    const dragX = dragOffset.x;
    const dragY = dragOffset.y;

    let positionStyle: React.CSSProperties = {
      position: 'absolute',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      pointerEvents: 'none',
      zIndex: 5,
      transition: isDragging ? 'none' : 'transform 0.3s ease-out, opacity 0.3s ease-out',
      willChange: 'transform, opacity'
    };

    // Position off-screen based on direction with inverted gestures
    if (direction === 'left') {
      // Left slot (A) is on the RIGHT - swipe left (negative dragX) to reveal
      const reveal = Math.max(0, -dragX); // Only when swiping left
      const opacity = Math.min(1, reveal / 150); // Fade in over 150px
      positionStyle = {
        ...positionStyle,
        right: 0,
        top: 0,
        transform: `translateX(calc(100% - ${reveal}px))`,
        opacity
      };
    } else if (direction === 'right') {
      // Right slot (B) is on the LEFT - swipe right (positive dragX) to reveal
      const reveal = Math.max(0, dragX); // Only when swiping right
      const opacity = Math.min(1, reveal / 150);
      positionStyle = {
        ...positionStyle,
        left: 0,
        top: 0,
        transform: `translateX(calc(-100% + ${reveal}px))`,
        opacity
      };
    } else if (direction === 'down') {
      // Down slot (C) is on the BOTTOM - swipe UP (negative dragY) to reveal
      const reveal = Math.max(0, -dragY); // Only when swiping UP (inverted!)
      const opacity = Math.min(1, reveal / 150);
      positionStyle = {
        ...positionStyle,
        left: 0,
        bottom: 0,
        transform: `translateY(calc(100% - ${reveal}px))`,
        opacity
      };
    }

    return (
      <video
        ref={videoRef}
        src={slot.videoUrl}
        style={positionStyle}
        muted
        playsInline
        preload="auto"
      />
    );
  };

  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center z-10 pointer-events-none overflow-hidden">
      {/* Darkening overlay (behind video previews) */}
      <div className="absolute inset-0 bg-black/60 animate-fade-in pointer-events-none z-0" />

      {/* Video preview peeks (above overlay) */}
      {renderVideoPreview('left', directionMap.left, leftVideoRef)}
      {renderVideoPreview('right', directionMap.right, rightVideoRef)}
      {renderVideoPreview('down', directionMap.down, downVideoRef)}

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
