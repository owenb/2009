"use client";

import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import VideoAdventureABI from "../../lib/VideoAdventure.abi.json";
import styles from "./SlotChoiceModal.module.css";
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
  onSlotSelected?: (sceneData: SceneData) => void; // Callback when a filled slot is clicked
  preloadedData?: { slots: SlotInfo[] } | null; // Preloaded slot data from parent
  onBack?: () => void; // Callback to go back to previous scene
  canGoBack?: boolean; // Whether back button should be shown
}

export default function SlotChoiceModal({ isVisible, parentSceneId = 'genesis', onSlotSelected, preloadedData, onBack, canGoBack = false }: SlotChoiceModalProps) {
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
      router.push(`/generating?promptId=${promptId}&sceneId=${sceneId}`);
    } else {
      // Redirect to create page (enter prompt)
      router.push(`/create?attemptId=${attemptId}&sceneId=${sceneId}`);
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
          router.push(`/create?attemptId=${data.attemptId}&sceneId=${lockSceneId}`);
        }, 1000);

      } catch (error) {
        console.error('Error verifying payment:', error);
        alert('Payment verification failed. Please contact support.');
        setStatusMessage('');
      }
    };

    verifyPayment();
  }, [isConfirmed, hash, lockSceneId, address, router]);

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
    <div className={styles.popup}>
      <div className={styles.popupContent}>
        <h2 className={styles.popupTitle}>What happens next?</h2>

        {!isConnected && (
          <div style={{
            background: 'rgba(255, 215, 0, 0.2)',
            border: '2px solid rgba(255, 215, 0, 0.5)',
            borderRadius: '10px',
            padding: '1rem',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            <p style={{ color: '#FFD700', fontWeight: 'bold', marginBottom: '0.5rem', fontFamily: 'var(--font-source-code-pro)' }}>
              🔒 Wallet Connection Required
            </p>
            <p style={{ color: '#fff', fontSize: '0.9rem', margin: 0, fontFamily: 'var(--font-source-code-pro)' }}>
              Please connect your wallet to continue the adventure
            </p>
          </div>
        )}

        {statusMessage && (
          <p style={{ color: '#FFD700', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-source-code-pro)' }}>
            {statusMessage}
          </p>
        )}

        {isPending && (
          <p style={{ color: '#FFD700', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-source-code-pro)' }}>
            Waiting for wallet confirmation...
          </p>
        )}

        {isConfirming && (
          <p style={{ color: '#FFD700', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-source-code-pro)' }}>
            Transaction pending on Base...
          </p>
        )}

        {loadError && (
          <p style={{ color: '#FF6B6B', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-source-code-pro)' }}>
            {loadError}
          </p>
        )}

        {isLoading ? (
          <p style={{ color: '#fff', textAlign: 'center', fontFamily: 'var(--font-source-code-pro)' }}>
            Loading slots...
          </p>
        ) : (
          <div className={styles.choicesContainer}>
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
                    className={`${styles.choice} ${isSlotLoading ? styles.choiceLoading : ''}`}
                    onClick={() => !isSlotLoading && handleFilledSlotClick(slotInfo.slot)}
                    style={{
                      cursor: isSlotLoading ? 'wait' : (canView ? 'pointer' : 'not-allowed'),
                      opacity: canView ? 1 : 0.6
                    }}
                  >
                    <div className={`${styles.choiceLabel} ${isSlotLoading ? styles.choiceLoadingLabel : ''}`}>
                      {slotInfo.slot}
                    </div>
                    <div className={styles.choiceText}>
                      {isSlotLoading ? 'loading...' : (slotInfo.label || 'view scene')}
                      {!canView && !isSlotLoading && <span style={{ fontSize: '0.8rem', display: 'block', marginTop: '0.25rem', color: 'rgba(255, 255, 255, 0.7)' }}>🔒 connect wallet</span>}
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
                    className={styles.choice}
                    onClick={() => handleResumeSlot(
                      slotInfo.attemptId!,
                      slotInfo.sceneId!,
                      slotInfo.latestPromptId,
                      slotInfo.latestPromptOutcome
                    )}
                    style={{
                      cursor: 'pointer',
                      background: 'rgba(0, 255, 0, 0.1)',
                      borderColor: 'rgba(0, 255, 0, 0.5)'
                    }}
                  >
                    <div className={styles.choiceLabel}>{slotInfo.slot}</div>
                    <div className={styles.choiceText}>
                      ✨ {hasActivePrompt ? 'view generation' : 'resume your scene'}
                      <span style={{ fontSize: '0.7rem', display: 'block', marginTop: '0.25rem', color: 'rgba(0, 255, 0, 0.7)' }}>
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
                    className={styles.choice}
                    style={{ cursor: 'not-allowed', opacity: 0.5 }}
                  >
                    <div className={styles.choiceLabel}>{slotInfo.slot}</div>
                    <div className={styles.choiceText}>
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
                    className={styles.choice}
                    style={{ cursor: 'not-allowed', opacity: 0.5 }}
                  >
                    <div className={styles.choiceLabel}>{slotInfo.slot}</div>
                    <div className={styles.choiceText}>
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
                  className={`${styles.choice} ${isDisabled ? styles.choiceDisabled : ''}`}
                  onClick={() => !isDisabled && handleSlotClick(slotInfo.slot, slotIndex)}
                  style={{
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.4 : 1,
                    borderColor: isFirstAvailable ? '#FFD700' : 'rgba(255, 255, 255, 0.15)'
                  }}
                >
                  <div className={styles.choiceLabel}>{slotInfo.slot}</div>
                  <div className={styles.choiceText}>
                    {isFirstAvailable ? 'extend this story' : 'available soon'}
                  </div>
                </div>
              );
              });
            })()}
          </div>
        )}

        {/* Footer with Back button, Map, and About link */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          {/* Back button - left side */}
          {onBack && (
            <button
              onClick={onBack}
              disabled={!canGoBack}
              style={{
                background: 'transparent',
                border: 'none',
                color: canGoBack ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.3)',
                fontFamily: 'var(--font-source-code-pro)',
                fontSize: '0.85rem',
                cursor: canGoBack ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0',
                transition: 'color 0.2s ease',
                opacity: canGoBack ? 1 : 0.5
              }}
              onMouseEnter={(e) => {
                if (canGoBack) e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
              }}
              onMouseLeave={(e) => {
                if (canGoBack) e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
              }}
            >
              <span>←</span>
              <span>Back</span>
            </button>
          )}

          {/* Spacer if no back button */}
          {!onBack && <div />}

          {/* Right side - Map and About */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            {/* Map button */}
            <button
              onClick={() => setShowMapModal(true)}
              style={{
                fontFamily: 'var(--font-source-code-pro)',
                fontSize: '0.85rem',
                color: 'rgba(255, 255, 255, 0.6)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'none',
                transition: 'color 0.2s ease',
                padding: '0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'}
            >
              <span>🗺️</span>
              <span>Story Map</span>
            </button>

            {/* About link */}
            <button
              onClick={() => setShowAboutModal(true)}
              style={{
                fontFamily: 'var(--font-source-code-pro)',
                fontSize: '0.85rem',
                color: 'rgba(255, 255, 255, 0.6)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'none',
                transition: 'color 0.2s ease',
                padding: '0'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'}
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
