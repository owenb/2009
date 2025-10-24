"use client";

import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import VideoAdventureABI from "../../lib/VideoAdventure.abi.json";
import ExtendStoryModal from "./ExtendStoryModal";
import AboutModal from "./AboutModal";
import SceneMapModal from "./SceneMapModal";
import type { SlotInfo } from "@/lib/db/types";
import type { SceneData } from "@/lib/types";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const SCENE_PRICE = process.env.NEXT_PUBLIC_SCENE_PRICE || "0.000056";

interface SlotChoiceModalProps {
  isVisible: boolean;
  parentSceneId?: number | 'genesis'; // Parent scene ID, default to 'genesis' (intro)
  movieSlug: string;
  onSlotSelected?: (sceneData: SceneData) => void; // Callback when a filled slot is clicked
  preloadedData?: { slots: SlotInfo[] } | null; // Preloaded slot data from parent
  onBack?: () => void; // Callback to go back to previous scene
  canGoBack?: boolean; // Whether back button should be shown
  backToLabel?: string | null; // Label of the scene we're going back to
}

export default function SlotChoiceModal({ isVisible, parentSceneId = 'genesis', movieSlug, onSlotSelected, preloadedData, onBack, canGoBack = false, backToLabel = null }: SlotChoiceModalProps) {
  const [_selectedSlot, setSelectedSlot] = useState<'A' | 'B' | 'C' | null>(null);
  const [_selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lockSceneId, setLockSceneId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [loadingSlot, setLoadingSlot] = useState<'A' | 'B' | 'C' | null>(null);

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
    }
  }, [isVisible]);

  // Fetch slots when modal becomes visible (or use preloaded data)
  useEffect(() => {
    if (!isVisible) return;

    // Check if we have preloaded data - instant display!
    if (preloadedData?.slots) {
      console.log('🚀 Using preloaded slots - instant display!');
      setSlots(preloadedData.slots);
      setIsLoading(false);
      setLoadError(null);
      return;
    }

    // Fallback: fetch if no preload (shouldn't happen in normal flow, but defensive)
    const fetchSlots = async () => {
      console.log('⚠️ No preloaded data - fetching slots (fallback)');
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

  // Handle clicking a filled slot (to play the scene)
  const handleFilledSlotClick = async (slot: 'A' | 'B' | 'C') => {
    // Require wallet connection for Base mini app
    if (!isConnected || !address) {
      alert("Please connect your wallet to continue watching!");
      return;
    }

    try {
      // Check if we have cached video URL for instant playback
      const cachedSlot = slots.find(s => s.slot === slot);
      const hasCachedVideo = !!cachedSlot?.videoUrl;

      // Only show loading state if we DON'T have cached video
      // If cached, transition will be instant (no loading UI)
      if (!hasCachedVideo) {
        setLoadingSlot(slot);
      } else {
        console.log(`✅ Using pre-cached video for slot ${slot} - instant playback!`);
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

      // If we have a cached video URL, use it instead of the API response
      // This enables instant playback from browser cache
      if (hasCachedVideo && cachedSlot) {
        sceneData.videoUrl = cachedSlot.videoUrl;
      }

      // Call the callback with the scene data
      if (onSlotSelected) {
        onSlotSelected(sceneData);
      }
    } catch (err) {
      console.error('Error loading scene:', err);
      alert('Failed to load scene. Please try again.');
      setLoadingSlot(null); // Clear loading state on error
    }
  };

  // Handle clicking own paid slot (resume generation)
  const handleResumeSlot = (
    attemptId: number,
    sceneId: number,
    promptId: number | null,
    promptOutcome: string | null
  ) => {
    // Check if there's an active prompt (pending or generating)
    const hasActivePrompt = promptId && (promptOutcome === 'pending' || promptOutcome === 'generating');

    if (hasActivePrompt) {
      // Redirect to generating page (polling status)
      router.push(`/movie/${movieSlug}/generating?promptId=${promptId}&sceneId=${sceneId}`);
    } else {
      // Redirect to create page (enter prompt)
      router.push(`/movie/${movieSlug}/create?attemptId=${attemptId}&sceneId=${sceneId}`);
    }
  };

  // Handle empty slot click - show ExtendStoryModal first
  const handleSlotClick = async (slot: 'A' | 'B' | 'C', slotIndex: number) => {
    if (!isConnected || !address) {
      alert("Please connect your wallet first!");
      return;
    }

    // Show ExtendStoryModal
    setPendingSlot({ slot, index: slotIndex });
    setShowExtendModal(true);
  };

  // Handle closing ExtendStoryModal (cancel)
  const handleCloseExtendModal = () => {
    setShowExtendModal(false);
    setPendingSlot(null);
  };

  // Handle confirmed slot extension (after user clicks CTA in ExtendStoryModal)
  const handleConfirmExtend = async () => {
    if (!pendingSlot || !isConnected || !address) return;

    const { slot, index: slotIndex } = pendingSlot;

    // Close ExtendStoryModal
    setShowExtendModal(false);
    setPendingSlot(null);

    if (isPending || isConfirming) {
      return; // Prevent multiple clicks during transaction
    }

    setSelectedSlot(slot);
    setSelectedSlotIndex(slotIndex);
    setStatusMessage('Reserving slot...');

    // Step 1: Acquire 1-minute lock
    try {
      const lockResponse = await fetch(`/api/scenes/${parentSceneId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot,
          userAddress: address,
          fid: undefined // TODO: Get from Farcaster if available
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

      console.log('Lock acquired:', lockData);

      // Step 2: Trigger smart contract transaction
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
            fid: undefined // TODO: Get from Farcaster if available
          })
        });

        if (!response.ok) {
          const error = await response.json();
          alert(error.error || 'Payment verification failed');
          setStatusMessage('');
          return;
        }

        const data = await response.json();
        console.log('Payment verified:', data);

        setStatusMessage('Payment verified! Redirecting...');

        // Step 3: Redirect to prompt creation page
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

  if (!isVisible) return null;

  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-end justify-center z-10 animate-fade-in pointer-events-none">
      <div className="relative w-full max-w-[600px] bg-black/85 rounded-t-[20px] p-8 pb-[max(2rem,env(safe-area-inset-bottom))] backdrop-blur-md shadow-[0_-10px_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] animate-slide-up pointer-events-auto sm:p-6 sm:pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] sm:max-w-full">
        <h2 className="font-source-code text-[1.5rem] font-bold text-white text-center m-0 mb-8 sm:mb-6 uppercase tracking-[0.1em]" style={{textShadow: '0 0 20px rgba(255, 255, 255, 0.5)'}}>
          What happens next?
        </h2>

        {!isConnected && (
          <div className="rounded-[10px] p-4 mb-4 text-center bg-movie-primary/20 border-2 border-movie-primary/50">
            <p className="text-movie-primary font-bold mb-2 font-source-code">
              🔒 Wallet Connection Required
            </p>
            <p className="text-white text-sm m-0 font-source-code">
              Please connect your wallet to continue the adventure
            </p>
          </div>
        )}

        {statusMessage && (
          <p className="text-movie-primary text-center mb-4 font-source-code">
            {statusMessage}
          </p>
        )}

        {isPending && (
          <p className="text-movie-primary text-center mb-4 font-source-code">
            Waiting for wallet confirmation...
          </p>
        )}

        {isConfirming && (
          <p className="text-movie-primary text-center mb-4 font-source-code">
            Transaction pending on Base...
          </p>
        )}

        {loadError && (
          <p className="text-[#FF6B6B] text-center mb-4 font-source-code">
            {loadError}
          </p>
        )}

        {isLoading ? (
          <p className="text-white text-center font-source-code">
            Loading slots...
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {(() => {
              // Find the first available slot (not filled, not locked, no attempt)
              const firstAvailableSlot = slots.find(slot =>
                !slot.exists && // Not a completed scene
                !slot.isLocked && // Not locked by someone
                !slot.attemptId // No active attempt
              )?.slot || null;

              return slots.map((slotInfo) => {
                const slotIndex = slotInfo.slot.charCodeAt(0) - 'A'.charCodeAt(0); // A=0, B=1, C=2

              // Filled slot (exists and completed) - CHECK THIS FIRST!
              if (slotInfo.exists && slotInfo.status === 'completed') {
                const canView = isConnected;
                const isSlotLoading = loadingSlot === slotInfo.slot;
                return (
                  <div
                    key={slotInfo.slot}
                    className={`flex items-center w-full bg-white/5 border-2 border-white/20 rounded-lg px-6 py-4 sm:px-4 sm:py-[0.9rem] cursor-pointer transition-all duration-200 relative overflow-visible min-h-[60px] hover:bg-white/10 hover:border-white/40 hover:translate-x-1 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] ${isSlotLoading ? 'slot-loading' : ''}`}
                    onClick={() => !isSlotLoading && handleFilledSlotClick(slotInfo.slot)}
                    style={{
                      cursor: isSlotLoading ? 'wait' : (canView ? 'pointer' : 'not-allowed'),
                      opacity: canView ? 1 : 0.6,
                      WebkitTapHighlightColor: 'rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    {isSlotLoading && (
                      <>
                        <div className="absolute -top-[3px] -left-[3px] -right-[3px] -bottom-[3px] rounded-[10px] -z-10 blur-[8px] bg-[length:400%_400%] animate-border-pulse" style={{
                          background: 'linear-gradient(45deg, transparent 0%, color-mix(in srgb, var(--movie-primary, #FFD700) 40%, transparent) 25%, color-mix(in srgb, var(--movie-primary, #FFD700) 80%, transparent) 50%, color-mix(in srgb, var(--movie-primary, #FFD700) 40%, transparent) 75%, transparent 100%)'
                        }} />
                        <div className="absolute top-0 left-0 right-0 bottom-0 rounded-lg pointer-events-none bg-[length:200%_100%] animate-shimmer" style={{
                          background: 'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--movie-primary, #FFD700) 10%, transparent) 50%, transparent 100%)'
                        }} />
                      </>
                    )}
                    <div className={`font-source-code text-2xl md:text-xl sm:text-base font-bold text-white w-9 h-9 md:w-8 md:h-8 sm:w-[34px] sm:h-[34px] flex items-center justify-center bg-white/10 rounded-md mr-4 sm:mr-3 flex-shrink-0 ${isSlotLoading ? 'slot-label-loading' : ''}`}>
                      {slotInfo.slot}
                    </div>
                    <div className="font-source-code text-lg md:text-base sm:text-[0.95rem] text-white/90 flex-1">
                      {isSlotLoading ? 'loading...' : (slotInfo.label || 'view scene')}
                      {!canView && !isSlotLoading && <span className="text-xs block mt-1 text-white/70">🔒 connect wallet</span>}
                    </div>
                  </div>
                );
              }

              // Check if this slot has an active attempt by the current user (NOT completed)
              const isOwnAttempt = !!(
                slotInfo.attemptId &&
                slotInfo.attemptCreator &&
                address &&
                slotInfo.attemptCreator.toLowerCase() === address.toLowerCase()
              );

              // Own paid slot - show resume option (only if not completed)
              if (isOwnAttempt) {
                const hasActivePrompt = slotInfo.latestPromptId &&
                  (slotInfo.latestPromptOutcome === 'pending' || slotInfo.latestPromptOutcome === 'generating');

                return (
                  <div
                    key={slotInfo.slot}
                    className="flex items-center w-full border-2 rounded-lg px-6 py-4 sm:px-4 sm:py-[0.9rem] cursor-pointer transition-all duration-200 relative overflow-hidden min-h-[60px] hover:bg-white/10 hover:border-white/40 hover:translate-x-1 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                    onClick={() => handleResumeSlot(
                      slotInfo.attemptId!,
                      slotInfo.sceneId!,
                      slotInfo.latestPromptId,
                      slotInfo.latestPromptOutcome
                    )}
                    style={{
                      background: 'rgba(0, 255, 0, 0.1)',
                      borderColor: 'rgba(0, 255, 0, 0.5)',
                      WebkitTapHighlightColor: 'rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    <div className="font-source-code text-2xl md:text-xl sm:text-base font-bold text-white w-9 h-9 md:w-8 md:h-8 sm:w-[34px] sm:h-[34px] flex items-center justify-center bg-white/10 rounded-md mr-4 sm:mr-3 flex-shrink-0">
                      {slotInfo.slot}
                    </div>
                    <div className="font-source-code text-lg md:text-base sm:text-[0.95rem] text-white/90 flex-1">
                      ✨ {hasActivePrompt ? 'view generation' : 'resume your scene'}
                      <span className="text-[0.7rem] block mt-1" style={{color: 'rgba(0, 255, 0, 0.7)'}}>
                        ({hasActivePrompt ? 'video generating...' : 'you paid for this'})
                      </span>
                    </div>
                  </div>
                );
              }

              // Slot with active attempt by someone else (reserved)
              if (slotInfo.attemptId && slotInfo.attemptCreator) {
                return (
                  <div
                    key={slotInfo.slot}
                    className="flex items-center w-full bg-white/5 border-2 border-white/20 rounded-lg px-6 py-4 sm:px-4 sm:py-[0.9rem] transition-all duration-200 relative overflow-hidden min-h-[60px] cursor-not-allowed opacity-50"
                    style={{WebkitTapHighlightColor: 'rgba(255, 255, 255, 0.1)'}}
                  >
                    <div className="font-source-code text-2xl md:text-xl sm:text-base font-bold text-white w-9 h-9 md:w-8 md:h-8 sm:w-[34px] sm:h-[34px] flex items-center justify-center bg-white/10 rounded-md mr-4 sm:mr-3 flex-shrink-0">
                      {slotInfo.slot}
                    </div>
                    <div className="font-source-code text-lg md:text-base sm:text-[0.95rem] text-white/90 flex-1">
                      being created...
                    </div>
                  </div>
                );
              }

              // Locked slot or in-progress states (someone is acquiring/creating it)
              // Check both isLocked flag AND status field to catch all creation states
              if (slotInfo.isLocked ||
                  slotInfo.status === 'locked' ||
                  slotInfo.status === 'verifying_payment' ||
                  slotInfo.status === 'awaiting_prompt' ||
                  slotInfo.status === 'generating') {
                return (
                  <div
                    key={slotInfo.slot}
                    className="flex items-center w-full bg-white/5 border-2 border-white/20 rounded-lg px-6 py-4 sm:px-4 sm:py-[0.9rem] transition-all duration-200 relative overflow-hidden min-h-[60px] cursor-not-allowed opacity-50"
                    style={{WebkitTapHighlightColor: 'rgba(255, 255, 255, 0.1)'}}
                  >
                    <div className="font-source-code text-2xl md:text-xl sm:text-base font-bold text-white w-9 h-9 md:w-8 md:h-8 sm:w-[34px] sm:h-[34px] flex items-center justify-center bg-white/10 rounded-md mr-4 sm:mr-3 flex-shrink-0">
                      {slotInfo.slot}
                    </div>
                    <div className="font-source-code text-lg md:text-base sm:text-[0.95rem] text-white/90 flex-1">
                      being created...
                    </div>
                  </div>
                );
              }

              // Empty/available slot
              const isFirstAvailable = slotInfo.slot === firstAvailableSlot;
              const isDisabled = !isFirstAvailable || isPending || isConfirming;

              return (
                <div
                  key={slotInfo.slot}
                  className={`flex items-center w-full bg-white/5 border-2 rounded-lg px-6 py-4 sm:px-4 sm:py-[0.9rem] transition-all duration-200 relative overflow-hidden min-h-[60px] hover:bg-white/10 hover:border-white/40 hover:translate-x-1 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] ${isDisabled ? 'grayscale-[0.5] pointer-events-none' : 'cursor-pointer'}`}
                  onClick={() => !isDisabled && handleSlotClick(slotInfo.slot, slotIndex)}
                  style={{
                    opacity: isDisabled ? 0.4 : 1,
                    borderColor: isFirstAvailable ? 'var(--movie-primary, #FFD700)' : 'rgba(255, 255, 255, 0.15)',
                    WebkitTapHighlightColor: 'rgba(255, 255, 255, 0.1)'
                  }}
                >
                  <div className={`font-source-code text-2xl md:text-xl sm:text-base font-bold w-9 h-9 md:w-8 md:h-8 sm:w-[34px] sm:h-[34px] flex items-center justify-center rounded-md mr-4 sm:mr-3 flex-shrink-0 ${isDisabled ? 'bg-white/5 text-white/40' : 'bg-white/10 text-white'}`}>
                    {slotInfo.slot}
                  </div>
                  <div className={`font-source-code text-lg md:text-base sm:text-[0.95rem] flex-1 ${isDisabled ? 'text-white/40 italic' : 'text-white/90'}`}>
                    {isFirstAvailable ? 'extend this story' : 'available soon'}
                  </div>
                </div>
              );
              });
            })()}
          </div>
        )}

        {/* Footer with Back button, Map, and About link */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/10">
          {/* Back button - left side */}
          {onBack && (
            <button
              onClick={onBack}
              disabled={!canGoBack}
              className={`bg-transparent border-none font-source-code text-sm flex items-center gap-2 p-0 transition-colors duration-200 ${canGoBack ? 'text-white/60 cursor-pointer hover:text-white/90 opacity-100' : 'text-white/30 cursor-not-allowed opacity-50'}`}
            >
              <span>←</span>
              <span>{backToLabel ? `Back to ${backToLabel}` : 'Back'}</span>
            </button>
          )}

          {/* Spacer if no back button */}
          {!onBack && <div />}

          {/* Right side - Map and About */}
          <div className="flex items-center gap-4">
            {/* Map button */}
            <button
              onClick={() => setShowMapModal(true)}
              className="font-source-code text-sm text-white/60 bg-transparent border-none cursor-pointer no-underline transition-colors duration-200 p-0 flex items-center gap-1 hover:text-white/90"
            >
              <span>🗺️</span>
              <span>Story Map</span>
            </button>

            {/* About link */}
            <button
              onClick={() => setShowAboutModal(true)}
              className="font-source-code text-sm text-white/60 bg-transparent border-none cursor-pointer no-underline transition-colors duration-200 p-0 hover:text-white/90"
            >
              About this game
            </button>
          </div>
        </div>
      </div>

      {/* ExtendStoryModal - shown before lock/payment */}
      {pendingSlot && (
        <ExtendStoryModal
          isVisible={showExtendModal}
          slot={pendingSlot.slot}
          onExtendClick={handleConfirmExtend}
          onClose={handleCloseExtendModal}
        />
      )}

      {/* AboutModal - explains the game */}
      <AboutModal
        isVisible={showAboutModal}
        onClose={() => setShowAboutModal(false)}
      />

      {/* SceneMapModal - navigate the tree */}
      <SceneMapModal
        isVisible={showMapModal}
        onClose={() => setShowMapModal(false)}
        onSceneSelect={(sceneId) => {
          setShowMapModal(false);
          // Navigate to scene page
          if (sceneId === 0) {
            // Reload to genesis - user can use the actual game flow
            window.location.reload();
          } else {
            // Navigate to scene
            window.location.href = `/scene/${sceneId}`;
          }
        }}
        currentSceneId={null}
      />
    </div>
  );
}
