"use client";

import { useState, useEffect } from "react";
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
import styles from "./YearCountdown.module.css";

interface SceneData {
  sceneId: number;
  videoUrl: string;
  slotLabel: string | null;
  creatorAddress: string | null;
  creatorFid: number | null;
  createdAt: string;
}

export default function YearCountdown() {
  const { address } = useAccount(); // Get connected wallet address
  const { isFrameReady, setFrameReady } = useMiniKit(); // Base mini app initialization
  const [showVideo, setShowVideo] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [currentScene, setCurrentScene] = useState<SceneData | null>(null);
  const [parentSceneId, setParentSceneId] = useState<number | 'genesis'>('genesis');
  const [previousSceneId, setPreviousSceneId] = useState<number | null>(null);

  // Signal to Base mini app that we're ready to display
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  const handleCountdownComplete = () => {
    setShowVideo(true);
  };

  const handleVideoEnd = () => {
    setShowPopup(true);
  };

  const handleSlotSelected = (sceneData: SceneData) => {
    // Hide modal
    setShowPopup(false);

    // Track previous scene for analytics
    setPreviousSceneId(currentScene?.sceneId ?? null);

    // Set current scene data
    setCurrentScene(sceneData);

    // Show video
    setShowVideo(true);

    // Update parent scene ID for next modal
    setParentSceneId(sceneData.sceneId);
  };

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
      />
    </div>
  );
}
