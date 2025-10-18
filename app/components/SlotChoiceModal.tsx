"use client";

import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { useEffect, useState } from "react";
import VideoAdventureABI from "../../lib/VideoAdventure.abi.json";
import styles from "./SlotChoiceModal.module.css";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const SCENE_PRICE = process.env.NEXT_PUBLIC_SCENE_PRICE || "0.00056";

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

interface SlotChoiceModalProps {
  isVisible: boolean;
  parentSceneId?: number | 'genesis'; // Parent scene ID, default to 'genesis' (intro)
}

export default function SlotChoiceModal({ isVisible, parentSceneId = 'genesis' }: SlotChoiceModalProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { isConnected } = useAccount();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Fetch slots when modal becomes visible
  useEffect(() => {
    if (!isVisible) return;

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
  }, [isVisible, parentSceneId]);

  // Handle slot selection and transaction
  const handleSlotClick = (slotIndex: number) => {
    if (!isConnected) {
      alert("Please connect your wallet first!");
      return;
    }

    if (isPending || isConfirming) {
      return; // Prevent multiple clicks during transaction
    }

    setSelectedSlot(slotIndex);

    // Call claimSlot on the smart contract
    // parentId = 0 (genesis/intro scene), slot = slotIndex (0=A, 1=B, 2=C)
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: VideoAdventureABI,
      functionName: "claimSlot",
      args: [BigInt(0), slotIndex], // parentId = 0, slot = 0/1/2
      value: parseEther(SCENE_PRICE),
    });
  };

  // Show transaction status
  useEffect(() => {
    if (isConfirmed && hash) {
      console.log("Transaction confirmed!", hash);
      alert(`Slot ${selectedSlot === 0 ? 'A' : selectedSlot === 1 ? 'B' : 'C'} claimed! Transaction: ${hash}`);
      // TODO: Redirect to prompt input or next step
    }
  }, [isConfirmed, hash, selectedSlot]);

  // Show transaction error
  useEffect(() => {
    if (error) {
      console.error("Transaction error:", error);
      alert(`Transaction failed: ${error.message}`);
    }
  }, [error]);

  if (!isVisible) return null;

  return (
    <div className={styles.popup}>
      <div className={styles.popupContent}>
        <h2 className={styles.popupTitle}>What happens next?</h2>

        {!isConnected && (
          <p style={{ color: '#fff', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-roboto-mono)' }}>
            Connect your wallet to claim a slot
          </p>
        )}

        {isPending && (
          <p style={{ color: '#FFD700', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-roboto-mono)' }}>
            Waiting for wallet confirmation...
          </p>
        )}

        {isConfirming && (
          <p style={{ color: '#FFD700', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-roboto-mono)' }}>
            Transaction pending...
          </p>
        )}

        {isConfirmed && (
          <p style={{ color: '#00FF00', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-roboto-mono)' }}>
            Slot claimed successfully!
          </p>
        )}

        {loadError && (
          <p style={{ color: '#FF6B6B', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-roboto-mono)' }}>
            {loadError}
          </p>
        )}

        {isLoading ? (
          <p style={{ color: '#fff', textAlign: 'center', fontFamily: 'var(--font-roboto-mono)' }}>
            Loading slots...
          </p>
        ) : (
          <div className={styles.choicesContainer}>
            {slots.map((slotInfo, index) => {
              const slotIndex = slotInfo.slot.charCodeAt(0) - 'A'.charCodeAt(0); // A=0, B=1, C=2

              // Filled slot (exists and completed)
              if (slotInfo.exists && slotInfo.status === 'completed') {
                return (
                  <div
                    key={slotInfo.slot}
                    className={styles.choice}
                    onClick={() => {
                      // TODO: Navigate to this scene and play video
                      alert(`Playing scene ${slotInfo.slot} (not yet implemented)`);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className={styles.choiceLabel}>{slotInfo.slot}</div>
                    <div className={styles.choiceText}>{slotInfo.label || ''}</div>
                  </div>
                );
              }

              // Locked slot (someone else is claiming it)
              if (slotInfo.isLocked) {
                return (
                  <div
                    key={slotInfo.slot}
                    className={styles.choice}
                    style={{ cursor: 'not-allowed', opacity: 0.5 }}
                  >
                    <div className={styles.choiceLabel}>{slotInfo.slot}</div>
                    <div className={styles.choiceText}>
                      Selected by {slotInfo.lockedBy?.slice(0, 6)}...
                    </div>
                  </div>
                );
              }

              // Empty/available slot
              return (
                <div
                  key={slotInfo.slot}
                  className={styles.choice}
                  onClick={() => handleSlotClick(slotIndex)}
                  style={{
                    cursor: isPending || isConfirming ? 'not-allowed' : 'pointer',
                    opacity: isPending || isConfirming ? 0.5 : 1
                  }}
                >
                  <div className={styles.choiceLabel}>{slotInfo.slot}</div>
                  <div className={styles.choiceText}></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
