"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
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
import styles from "./YearCountdown.module.css";
import VideoAdventureABI from "../../lib/VideoAdventure.abi.json";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const SCENE_PRICE = process.env.NEXT_PUBLIC_SCENE_PRICE || "0.00056";

export default function YearCountdown() {
  const [currentYear, setCurrentYear] = useState(2025);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isExploding, setIsExploding] = useState(false);
  const [scale, setScale] = useState(0.1);
  const [videoFadeIn, setVideoFadeIn] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const totalDuration = 4000; // Total animation duration in ms

  // Wagmi hooks
  const { isConnected } = useAccount();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Initialize start time once on mount
  useEffect(() => {
    startTimeRef.current = Date.now();
  }, []);

  // Ease-in-out function (cubic)
  const easeInOutCubic = (t: number): number => {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // Smooth scale animation based on elapsed time
  useEffect(() => {
    let animationFrameId: number;

    const updateScale = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(elapsed / totalDuration, 1);
      const newScale = 0.1 + (progress * 0.9); // 0.1 to 1.0
      setScale(newScale);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(updateScale);
      }
    };

    animationFrameId = requestAnimationFrame(updateScale);

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Calculate delay based on position in countdown with easing
  const getDelay = (): number => {
    const progress = (2025 - currentYear) / (2025 - 2009);
    const easedSpeed = easeInOutCubic(progress);

    // Invert the easing so slower at beginning/end, faster in middle
    const minDelay = 20; // Fastest (middle)
    const maxDelay = 400; // Slowest (start/end)

    return maxDelay - (easedSpeed * (maxDelay - minDelay));
  };

  // Number countdown logic
  useEffect(() => {
    if (currentYear < 2009) return;

    if (currentYear === 2009) {
      // Trigger explosion effect
      const explosionTimer = setTimeout(() => {
        setIsExploding(true);
      }, 500);
      return () => clearTimeout(explosionTimer);
    }

    const delay = getDelay();

    const timer = setTimeout(() => {
      setIsAnimating(true);

      // Change the number after a brief moment to allow animation
      setTimeout(() => {
        setCurrentYear(prev => prev - 1);
        setIsAnimating(false);
      }, 40);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentYear]);

  // Preload and prepare video
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, []);

  // Trigger video fade-in when explosion happens
  useEffect(() => {
    if (isExploding) {
      setVideoFadeIn(true);
      if (videoRef.current) {
        videoRef.current.play();
      }
    }
  }, [isExploding]);

  // Handle video end
  const handleVideoEnd = () => {
    setShowPopup(true);
  };

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

  return (
    <div className={styles.container}>
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

      <video
        ref={videoRef}
        className={`${styles.video} ${videoFadeIn ? styles.videoFadeIn : ''}`}
        src="/intro/intro.mp4"
        preload="auto"
        playsInline
        muted
        loop={false}
        onEnded={handleVideoEnd}
      />
      <div
        className={`${styles.year} ${isAnimating ? styles.animating : ''} ${isExploding ? styles.exploding : ''}`}
        style={{
          transform: `scale(${scale})`,
          opacity: isExploding ? 0 : 1
        }}
      >
        {currentYear}
      </div>

      {showPopup && (
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

            <div className={styles.choicesContainer}>
              {/* Filled slot A - plays existing scene */}
              <div
                className={styles.choice}
                onClick={() => {
                  // TODO: Navigate to scene A and play video
                  alert("Playing scene A (not yet implemented)");
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className={styles.choiceLabel}>A</div>
                <div className={styles.choiceText}>walk to the bedroom</div>
              </div>

              {/* Filled slot B - plays existing scene */}
              <div
                className={styles.choice}
                onClick={() => {
                  // TODO: Navigate to scene B and play video
                  alert("Playing scene B (not yet implemented)");
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className={styles.choiceLabel}>B</div>
                <div className={styles.choiceText}>make cup of tea</div>
              </div>

              {/* Empty slot C - allows claiming */}
              <div
                className={styles.choice}
                onClick={() => handleSlotClick(2)}
                style={{ cursor: isPending || isConfirming ? 'not-allowed' : 'pointer', opacity: isPending || isConfirming ? 0.5 : 1 }}
              >
                <div className={styles.choiceLabel}>C</div>
                <div className={styles.choiceText}></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
