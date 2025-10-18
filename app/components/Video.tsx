"use client";

import { useRef, useEffect, useState } from "react";
import styles from "./Video.module.css";

interface VideoProps {
  sceneId: number | null; // null for genesis/intro scene, number for all other scenes
  isVisible: boolean;
  onVideoEnd: () => void;
}

export default function Video({ sceneId, isVisible, onVideoEnd }: VideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

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

  // Fetch URL on mount and when sceneId changes
  useEffect(() => {
    fetchVideoUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId]);

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

  // Play video when visible
  useEffect(() => {
    if (isVisible && videoRef.current && videoUrl) {
      videoRef.current.play().catch((err) => {
        console.error('Error playing video:', err);
      });
    }
  }, [isVisible, videoUrl]);

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
        muted
        loop={false}
        onEnded={onVideoEnd}
      />
    </>
  );
}
