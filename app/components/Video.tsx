"use client";

import { useRef, useEffect, useState } from "react";
import { useEnsName } from "wagmi";
import { useComposeCast } from "@coinbase/onchainkit/minikit";
import { trackSceneView } from "@/lib/analytics";
import styles from "./Video.module.css";

interface VideoProps {
  sceneId: number | null; // null for genesis/intro scene, number for all other scenes
  isVisible: boolean;
  onVideoEnd: () => void;
  directUrl?: string; // Optional: if provided, use this URL instead of fetching
  creatorAddress?: string | null; // Creator info for attribution
  creatorFid?: number | null;
  slotLabel?: string | null;
  viewerAddress?: string; // Current viewer's wallet address for analytics
  viewerFid?: number; // Current viewer's Farcaster ID for analytics
  referrerSceneId?: number; // Previous scene ID for path tracking
  createdAt?: string; // Timestamp when the scene was created
}

export default function Video({
  sceneId,
  isVisible,
  onVideoEnd,
  directUrl,
  creatorAddress,
  creatorFid: _creatorFid,
  slotLabel: _slotLabel,
  viewerAddress,
  viewerFid,
  referrerSceneId,
  createdAt
}: VideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [hasTrackedView, setHasTrackedView] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // ENS name resolution
  const { data: ensName } = useEnsName({
    address: creatorAddress as `0x${string}` | undefined,
    chainId: 1, // Ethereum mainnet for ENS
  });

  // Share hook
  const { composeCast } = useComposeCast();

  // Handle sharing the scene
  const handleShare = () => {
    if (!sceneId) return; // Don't share genesis/intro
    const sceneUrl = `${process.env.NEXT_PUBLIC_URL || window.location.origin}/scene/${sceneId}`;
    composeCast({
      text: `Check out this alternate 2009 timeline! 🎬✨`,
      embeds: [sceneUrl]
    });
  };

  // Fetch signed URL from API
  const fetchVideoUrl = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const sceneIdParam = sceneId === null ? 'genesis' : sceneId;
      const response = await fetch(`/api/scenes/${sceneIdParam}/video`);

      if (!response.ok) {
        throw new Error('Failed to fetch video URL');
      }

      const data = await response.json();
      setVideoUrl(data.url);
      setExpiresAt(new Date(data.expiresAt));
    } catch (err) {
      console.error('Error fetching video URL:', err);
      setError('Failed to load video');
    } finally {
      setIsLoading(false);
    }
  };

  // Use direct URL if provided, otherwise fetch
  useEffect(() => {
    // Reset tracking flag when scene changes
    setHasTrackedView(false);

    if (directUrl) {
      setVideoUrl(directUrl);
      setIsLoading(false);
      setError(null);
    } else {
      fetchVideoUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, directUrl]);

  // Refresh URL before expiration (at 55-minute mark)
  useEffect(() => {
    if (!expiresAt) return;

    const now = Date.now();
    const expiryTime = expiresAt.getTime();
    const refreshTime = expiryTime - 5 * 60 * 1000; // 5 minutes before expiry
    const timeUntilRefresh = refreshTime - now;

    if (timeUntilRefresh > 0) {
      const timer = setTimeout(() => {
        console.log('Refreshing video URL before expiration...');
        fetchVideoUrl();
      }, timeUntilRefresh);

      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  // Preload and prepare video
  useEffect(() => {
    if (videoRef.current && videoUrl) {
      videoRef.current.load();
    }
  }, [videoUrl]);

  // Play video when visible and track view
  useEffect(() => {
    if (isVisible && videoRef.current && videoUrl) {
      videoRef.current.play().catch((err) => {
        console.error('Error playing video:', err);
      });

      // Track view (only once per scene load)
      if (!hasTrackedView && sceneId !== null) {
        trackSceneView({
          sceneId,
          viewerAddress,
          viewerFid,
          referrerSceneId
        }).then((success) => {
          if (success) {
            setHasTrackedView(true);
          }
        });
      }
    }
  }, [isVisible, videoUrl, hasTrackedView, sceneId, viewerAddress, viewerFid, referrerSceneId]);

  // Toggle mute/unmute
  const toggleMute = () => {
    if (videoRef.current) {
      const newMutedState = !isMuted;
      setIsMuted(newMutedState);
      videoRef.current.muted = newMutedState;
    }
  };

  return (
    <>
      {/* Show loading spinner for non-intro videos */}
      {isLoading && sceneId !== null && (
        <div className={styles.loading} style={{ opacity: isVisible ? 1 : 0 }}>
          <p>Loading video...</p>
        </div>
      )}

      {error && (
        <div className={styles.error} style={{ opacity: isVisible ? 1 : 0 }}>
          <p>{error}</p>
          <button onClick={fetchVideoUrl}>Retry</button>
        </div>
      )}

      <video
        ref={videoRef}
        className={`${styles.video} ${isVisible ? styles.videoFadeIn : ''}`}
        src={videoUrl || undefined}
        preload="auto"
        playsInline
        muted={isMuted}
        loop={false}
        onEnded={onVideoEnd}
      />

      {/* Controls container - mute and share buttons */}
      {isVisible && videoUrl && (
        <div className={styles.controlsContainer}>
          <button
            onClick={toggleMute}
            className={styles.muteButton}
            aria-label={isMuted ? "Unmute video" : "Mute video"}
          >
            {isMuted ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
            <span>{isMuted ? "UNMUTE" : "MUTE"}</span>
          </button>

          {/* Share button - only show for non-genesis scenes */}
          {sceneId !== null && (
            <button
              onClick={handleShare}
              className={styles.shareButton}
              aria-label="Share this scene"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span>SHARE</span>
            </button>
          )}
        </div>
      )}

      {/* Creator attribution */}
      {isVisible && creatorAddress && (
        <div className={styles.attribution}>
          <div className={styles.attributionText}>
            <div className={styles.creatorLine}>
              Created by {ensName || creatorAddress}
            </div>
            {createdAt && (
              <div className={styles.timestampLine}>
                {new Date(createdAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
