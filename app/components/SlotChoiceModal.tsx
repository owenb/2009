"use client";

import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

interface SceneData {
  sceneId: number;
  videoUrl: string;
  slotLabel: string | null;
  creatorAddress: string | null;
  creatorFid: number | null;
  createdAt: string;
}

interface SlotChoiceModalProps {
  isVisible: boolean;
  parentSceneId?: number | 'genesis'; // Parent scene ID, default to 'genesis' (intro)
  onSlotSelected?: (sceneData: SceneData) => void; // Callback when a filled slot is clicked
}

export default function SlotChoiceModal({ isVisible, parentSceneId = 'genesis', onSlotSelected }: SlotChoiceModalProps) {
  const [_selectedSlot, setSelectedSlot] = useState<'A' | 'B' | 'C' | null>(null);
  const [_selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lockSceneId, setLockSceneId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const router = useRouter();
  const { address, isConnected, chain } = useAccount();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Check if user is on correct network
  const REQUIRED_CHAIN_ID = 84532; // Base Sepolia testnet
  const isWrongNetwork = chain && chain.id !== REQUIRED_CHAIN_ID;

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

  // Handle clicking a filled slot (to play the scene)
  const handleFilledSlotClick = async (slot: 'A' | 'B' | 'C') => {
    try {
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

      // Call the callback with the scene data
      if (onSlotSelected) {
        onSlotSelected(sceneData);
      }
    } catch (err) {
      console.error('Error loading scene:', err);
      alert('Failed to load scene. Please try again.');
    }
  };

  // Handle slot selection and transaction
  const handleSlotClick = async (slot: 'A' | 'B' | 'C', slotIndex: number) => {
    if (!isConnected || !address) {
      alert("Please connect your wallet first!");
      return;
    }

    // Check network before proceeding
    if (isWrongNetwork) {
      alert(`Wrong network! Please switch to Base Sepolia testnet in your wallet.\n\nCurrent: ${chain?.name}\nRequired: Base Sepolia (Chain ID: 84532)`);
      return;
    }

    if (isPending || isConfirming) {
      return; // Prevent multiple clicks during transaction
    }

    setSelectedSlot(slot);
    setSelectedSlotIndex(slotIndex);
    setStatusMessage('Acquiring lock...');

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
          <p style={{ color: '#fff', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-roboto-mono)' }}>
            Connect your wallet to claim a slot
          </p>
        )}

        {isConnected && isWrongNetwork && (
          <div style={{
            background: 'rgba(255, 107, 107, 0.2)',
            border: '2px solid rgba(255, 107, 107, 0.5)',
            borderRadius: '10px',
            padding: '1rem',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            <p style={{ color: '#FF6B6B', fontWeight: 'bold', marginBottom: '0.5rem', fontFamily: 'var(--font-roboto-mono)' }}>
              ⚠️ Wrong Network
            </p>
            <p style={{ color: '#fff', fontSize: '0.9rem', margin: 0, fontFamily: 'var(--font-roboto-mono)' }}>
              Please switch to <strong>Base Sepolia</strong> testnet in your wallet
            </p>
            <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.8rem', marginTop: '0.5rem', fontFamily: 'var(--font-roboto-mono)' }}>
              Current: {chain?.name} (Chain ID: {chain?.id})
            </p>
          </div>
        )}

        {statusMessage && (
          <p style={{ color: '#FFD700', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-roboto-mono)' }}>
            {statusMessage}
          </p>
        )}

        {isPending && (
          <p style={{ color: '#FFD700', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-roboto-mono)' }}>
            Waiting for wallet confirmation...
          </p>
        )}

        {isConfirming && (
          <p style={{ color: '#FFD700', textAlign: 'center', marginBottom: '1rem', fontFamily: 'var(--font-roboto-mono)' }}>
            Transaction pending on Base...
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
            {slots.map((slotInfo) => {
              const slotIndex = slotInfo.slot.charCodeAt(0) - 'A'.charCodeAt(0); // A=0, B=1, C=2

              // Filled slot (exists and completed)
              if (slotInfo.exists && slotInfo.status === 'completed') {
                return (
                  <div
                    key={slotInfo.slot}
                    className={styles.choice}
                    onClick={() => handleFilledSlotClick(slotInfo.slot)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className={styles.choiceLabel}>{slotInfo.slot}</div>
                    <div className={styles.choiceText}>{slotInfo.label || 'view scene'}</div>
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
                  onClick={() => handleSlotClick(slotInfo.slot, slotIndex)}
                  style={{
                    cursor: isPending || isConfirming ? 'not-allowed' : 'pointer',
                    opacity: isPending || isConfirming ? 0.5 : 1
                  }}
                >
                  <div className={styles.choiceLabel}>{slotInfo.slot}</div>
                  <div className={styles.choiceText}>claim this slot</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
