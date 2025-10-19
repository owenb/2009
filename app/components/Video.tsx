"use client";

import { useRef, useEffect, useState } from "react";
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
}

export default function Video({
  sceneId,
  isVisible,
  onVideoEnd,
  directUrl,
  creatorAddress,
  creatorFid,
  slotLabel: _slotLabel,
  viewerAddress,
  viewerFid,
  referrerSceneId
}: VideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [hasTrackedView, setHasTrackedView] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

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

      {/* Unmute button */}
      {isVisible && videoUrl && (
        <button
          onClick={toggleMute}
          className={styles.muteButton}
          aria-label={isMuted ? "Unmute video" : "Mute video"}
        >
          {isMuted ? "🔇 UNMUTE" : "🔊 MUTE"}
        </button>
      )}

      {/* Creator attribution */}
      {isVisible && creatorAddress && (
        <div className={styles.attribution}>
          <p className={styles.attributionText}>
            Created by {creatorAddress.slice(0, 6)}...{creatorAddress.slice(-4)}
            {creatorFid && ` (FID: ${creatorFid})`}
          </p>
        </div>
      )}
    </>
  );
}
