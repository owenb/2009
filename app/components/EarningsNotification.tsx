"use client";

import { useEffect, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import VideoAdventureABI from "../../lib/VideoAdventure.abi.json";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

interface EarningsNotificationProps {
  isVisible: boolean; // Should match parent modal visibility
}

export default function EarningsNotification({ isVisible }: EarningsNotificationProps) {
  const { address, isConnected } = useAccount();
  const [earningsEth, setEarningsEth] = useState<string>("0");
  const [hasEarnings, setHasEarnings] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showShareButton, setShowShareButton] = useState(false);
  const [claimedAmount, setClaimedAmount] = useState<string>("0");

  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Fetch earnings when visible and connected
  useEffect(() => {
    if (!isVisible || !isConnected || !address) {
      return;
    }

    const fetchEarnings = async () => {
      try {
        const response = await fetch(`/api/earnings/balance?address=${address}`);
        if (!response.ok) {
          throw new Error('Failed to fetch earnings');
        }

        const data = await response.json();
        setEarningsEth(data.earningsEth);
        setHasEarnings(data.hasEarnings);
      } catch (err) {
        console.error('Error fetching earnings:', err);
      }
    };

    fetchEarnings();
  }, [isVisible, isConnected, address]);

  // Handle successful claim
  useEffect(() => {
    if (isConfirmed && earningsEth !== "0") {
      setClaimedAmount(earningsEth);
      setShowShareButton(true);
      setHasEarnings(false);
      setEarningsEth("0");
    }
  }, [isConfirmed, earningsEth]);

  // Handle claim
  const handleClaim = () => {
    if (!isConnected) {
      alert("Please connect your wallet first!");
      return;
    }

    writeContract({
      address: CONTRACT_ADDRESS,
      abi: VideoAdventureABI,
      functionName: "withdrawEarnings",
    });
  };

  // Handle share
  const handleShare = () => {
    const shareText = `I just claimed ${claimedAmount} ETH from my interactive movie creations on 2009! 🎬💰\n\nCreate your own alternate timeline: ${window.location.origin}`;

    // Try native share API first (mobile)
    if (navigator.share) {
      navigator.share({
        text: shareText,
      }).catch((err) => {
        console.error('Error sharing:', err);
        // Fallback to copy
        copyToClipboard(shareText);
      });
    } else {
      // Desktop: copy to clipboard
      copyToClipboard(shareText);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Share text copied to clipboard!');
    }).catch((err) => {
      console.error('Failed to copy:', err);
      alert('Failed to copy share text');
    });
  };

  // Don't render if no earnings
  if (!hasEarnings && !showShareButton) {
    return null;
  }

  return (
    <div className="absolute top-[8%] right-[5%] z-30 pointer-events-auto">
      {/* Bell icon (always visible when there are earnings) */}
      {hasEarnings && !isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="relative bg-black/60 backdrop-blur-sm rounded-full p-3 border-2 border-[var(--movie-primary,#FFD700)] hover:bg-black/80 transition-all duration-200 animate-bounce"
        >
          <span className="text-2xl">🔔</span>
          {/* Notification badge */}
          <div className="absolute -top-1 -right-1 bg-[var(--movie-primary,#FFD700)] text-black rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold font-source-code-pro">
            !
          </div>
        </button>
      )}

      {/* Expanded view */}
      {isExpanded && hasEarnings && (
        <div className="bg-black/80 backdrop-blur-md rounded-lg p-4 border-2 border-[var(--movie-primary,#FFD700)] min-w-[260px] animate-fly-in">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔔</span>
              <div className="font-source-code-pro text-white font-bold text-sm">
                Earnings Available
              </div>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-white/60 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>

          {/* Amount display */}
          <div className="mb-4 text-center">
            <div className="text-[var(--movie-primary,#FFD700)] font-source-code-pro font-bold text-3xl mb-1">
              {earningsEth} ETH
            </div>
            <div className="text-white/60 font-source-code-pro text-xs">
              from your creations
            </div>
          </div>

          {/* Claim button */}
          <button
            onClick={handleClaim}
            disabled={isPending || isConfirming}
            className="w-full bg-[var(--movie-primary,#FFD700)] text-black font-source-code-pro font-bold py-2 px-4 rounded-lg hover:bg-[var(--movie-secondary,#FFA500)] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending && "Waiting for wallet..."}
            {isConfirming && "Claiming..."}
            {!isPending && !isConfirming && "Claim Now"}
          </button>

          {/* Error message */}
          {error && (
            <div className="mt-2 text-red-400 font-source-code-pro text-xs text-center">
              Error: {error.message}
            </div>
          )}
        </div>
      )}

      {/* Share button (shown after successful claim) */}
      {showShareButton && (
        <div className="bg-black/80 backdrop-blur-md rounded-lg p-4 border-2 border-[var(--movie-primary,#FFD700)] min-w-[260px] animate-fly-in">
          <div className="text-center mb-3">
            <div className="text-4xl mb-2">🎉</div>
            <div className="font-source-code-pro text-white font-bold text-sm mb-1">
              Claimed {claimedAmount} ETH!
            </div>
            <div className="text-white/60 font-source-code-pro text-xs">
              Share your success
            </div>
          </div>

          <button
            onClick={handleShare}
            className="w-full bg-[var(--movie-primary,#FFD700)] text-black font-source-code-pro font-bold py-2 px-4 rounded-lg hover:bg-[var(--movie-secondary,#FFA500)] transition-colors duration-200 mb-2"
          >
            Share 📢
          </button>

          <button
            onClick={() => setShowShareButton(false)}
            className="w-full text-white/60 font-source-code-pro text-xs hover:text-white transition-colors duration-200"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
