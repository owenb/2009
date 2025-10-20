"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
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
import Video from "../../components/Video";
import SlotChoiceModal from "../../components/SlotChoiceModal";
import styles from "../../components/WatchMovie.module.css";
import type { SceneData, PreloadedSlotsData } from "@/lib/types";

export default function ScenePage() {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const sceneId = params.id as string;

  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [preloadedSlots, setPreloadedSlots] = useState<PreloadedSlotsData | null>(null);
  const [sceneHistory, setSceneHistory] = useState<SceneData[]>([]);
  const [currentScene, setCurrentScene] = useState<SceneData | null>(null);

  // Load scene data
  useEffect(() => {
    const loadScene = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/scenes/${sceneId}`);

        if (!response.ok) {
          throw new Error('Failed to load scene');
        }

        const data = await response.json();
        setSceneData(data);
        setCurrentScene(data);
        setShowVideo(true);
      } catch (err) {
        console.error('Error loading scene:', err);
        setError('Failed to load scene. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadScene();
  }, [sceneId]);

  // Preload slots when video starts
  useEffect(() => {
    if (!showVideo || !sceneData) {
      setPreloadedSlots(null);
      return;
    }

    const preloadSlots = async () => {
      try {
        const response = await fetch(`/api/scenes/${sceneData.sceneId}/slots`);
        if (!response.ok) {
          console.error('Failed to preload slots');
          return;
        }
        const data = await response.json();
        setPreloadedSlots(data);
        console.log('✅ Slots preloaded', data);
      } catch (err) {
        console.error('Error preloading slots:', err);
      }
    };

    preloadSlots();
  }, [showVideo, sceneData]);

  const handleVideoEnd = () => {
    setShowPopup(true);
  };

  const handleSlotSelected = (newSceneData: SceneData) => {
    setShowPopup(false);
    setPreloadedSlots(null);

    // Push current scene to history
    if (currentScene) {
      setSceneHistory(prev => [...prev, currentScene]);
    }

    // Update current scene
    setCurrentScene(newSceneData);
    setShowVideo(true);
  };

  const handleBack = () => {
    if (sceneHistory.length === 0) {
      // Go back to home if no history
      router.push('/');
      return;
    }

    const previousScene = sceneHistory[sceneHistory.length - 1];
    const newHistory = sceneHistory.slice(0, -1);

    setShowPopup(false);
    setPreloadedSlots(null);
    setSceneHistory(newHistory);
    setCurrentScene(previousScene);
    setShowVideo(true);
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#fff',
          fontFamily: 'var(--font-source-code-pro)',
          textAlign: 'center'
        }}>
          <p>Loading scene...</p>
        </div>
      </div>
    );
  }

  if (error || !sceneData) {
    return (
      <div className={styles.container}>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#fff',
          fontFamily: 'var(--font-source-code-pro)',
          textAlign: 'center'
        }}>
          <p style={{ color: '#FF6B6B', marginBottom: '1rem' }}>{error || 'Scene not found'}</p>
          <button
            onClick={() => router.push('/')}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '8px',
              padding: '0.75rem 1.5rem',
              color: '#fff',
              fontFamily: 'var(--font-source-code-pro)',
              cursor: 'pointer'
            }}
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

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
        createdAt={currentScene?.createdAt}
      />

      {/* Slot choice modal */}
      <SlotChoiceModal
        isVisible={showPopup}
        parentSceneId={currentScene?.sceneId ?? 'genesis'}
        onSlotSelected={handleSlotSelected}
        preloadedData={preloadedSlots}
        onBack={handleBack}
        canGoBack={sceneHistory.length > 0}
      />
    </div>
  );
}
