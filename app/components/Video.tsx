"use client";

import { useRef, useEffect, useState } from "react";
import { useEnsName } from "wagmi";
import { useComposeCast } from "@coinbase/onchainkit/minikit";
import { trackSceneView } from "@/lib/analytics";

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
  const [needsManualPlay, setNeedsManualPlay] = useState(false);

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
    setNeedsManualPlay(false);

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
    if (!isVisible || !videoRef.current || !videoUrl) return;

    let cancelled = false;

    const attemptPlay = async () => {
      try {
        // Ensure video is muted before playing for better autoplay compatibility
        if (videoRef.current) {
          videoRef.current.muted = isMuted;
        }

        // Wait a brief moment to ensure video element is ready
        await new Promise(resolve => setTimeout(resolve, 100));

        if (cancelled || !videoRef.current) return;

        // Ensure video has loaded enough to play
        if (videoRef.current.readyState < 2) {
          await new Promise((resolve) => {
            const handleCanPlay = () => {
              videoRef.current?.removeEventListener('canplay', handleCanPlay);
              resolve(undefined);
            };
            videoRef.current?.addEventListener('canplay', handleCanPlay);
          });
        }

        if (cancelled || !videoRef.current) return;

        await videoRef.current.play();
        if (!cancelled) {
          setNeedsManualPlay(false);
        }
      } catch (err: unknown) {
        if (cancelled) return;

        // Only show manual play button for actual autoplay policy blocks
        // Ignore interruption errors (AbortError or interrupted by new load)
        const error = err as Error;
        const isInterruption =
          error.name === 'AbortError' ||
          error.message?.includes('interrupted') ||
          error.message?.includes('aborted');

        if (!isInterruption) {
          console.error('Video autoplay blocked by browser:', error.message);
          setNeedsManualPlay(true);
        }
      }
    };

    attemptPlay();

    // Track view (only once per scene load)
    if (!hasTrackedView && sceneId !== null) {
      trackSceneView({
        sceneId,
        viewerAddress,
        viewerFid,
        referrerSceneId
      }).then((success) => {
        if (success && !cancelled) {
          setHasTrackedView(true);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [isVisible, videoUrl, hasTrackedView, sceneId, viewerAddress, viewerFid, referrerSceneId, isMuted]);

  // Manual play handler
  const handleManualPlay = async () => {
    if (!videoRef.current) return;

    try {
      // Ensure video is loaded before playing
      if (videoRef.current.readyState < 2) {
        await new Promise((resolve) => {
          const handleCanPlay = () => {
            videoRef.current?.removeEventListener('canplay', handleCanPlay);
            resolve(undefined);
          };
          videoRef.current?.addEventListener('canplay', handleCanPlay);
          videoRef.current?.load();
        });
      }

      await videoRef.current.play();
      setNeedsManualPlay(false);
    } catch (err) {
      console.error('Manual play failed:', err);
      // Keep the button visible if it fails
    }
  };

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
      {/* Show loading spinner while video is loading */}
      {isLoading && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-white font-saira z-[2]"
          style={{ opacity: isVisible ? 1 : 0 }}
        >
          <div className="animate-spin h-8 w-8 border-4 border-white/20 border-t-white rounded-full mx-auto mb-3" />
          <p className="text-sm">Loading video...</p>
        </div>
      )}

      {error && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-white font-saira z-[2]"
          style={{ opacity: isVisible ? 1 : 0 }}
        >
          <p>{error}</p>
          <button
            onClick={fetchVideoUrl}
            className="mt-4 px-4 py-2 bg-white/10 border-2 border-white/30 rounded-lg text-white font-saira cursor-pointer transition-all duration-200 hover:bg-white/20 hover:border-white/50"
          >
            Retry
          </button>
        </div>
      )}

      {/* Manual play button - shown when autoplay is blocked */}
      {needsManualPlay && isVisible && !error && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-[4]">
          <button
            onClick={handleManualPlay}
            className="px-8 py-4 bg-white/20 backdrop-blur-md border-2 border-white/50 rounded-lg text-white font-saira text-lg font-bold cursor-pointer transition-all duration-200 hover:bg-white/30 hover:border-white/70 hover:scale-105 active:scale-95"
          >
            ▶ Click to Play
          </button>
          <p className="mt-3 text-white/70 text-sm font-saira">
            Your browser blocked autoplay
          </p>
        </div>
      )}

      <video
        ref={videoRef}
        className={`absolute top-0 left-0 w-full h-full object-cover z-[1] transition-opacity duration-1000 ease-in ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        src={videoUrl || undefined}
        preload="auto"
        playsInline
        muted={isMuted}
        autoPlay={false}
        loop={false}
        onEnded={onVideoEnd}
      />

      {/* Controls container - mute and share buttons */}
      {isVisible && videoUrl && (
        <div className="absolute top-5 left-5 flex gap-2 z-[3]">
          <button
            onClick={toggleMute}
            className="bg-white/30 backdrop-blur-md border-none rounded-lg px-4 py-2 text-white font-saira text-xs font-semibold cursor-pointer transition-all duration-200 uppercase flex items-center gap-2 hover:bg-white/40 hover:scale-105 active:scale-95"
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
              className="bg-white/30 backdrop-blur-md border-none rounded-lg px-4 py-2 text-white font-saira text-xs font-semibold cursor-pointer transition-all duration-200 uppercase flex items-center gap-2 hover:bg-white/40 hover:scale-105 active:scale-95"
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
      {isVisible && creatorAddress && creatorAddress !== '0x0000000000000000000000000000000000000000' && (
        <div className="absolute bottom-5 left-5 bg-black/70 backdrop-blur-md px-4 py-2 rounded-lg z-[3]">
          <div className="text-white/90 font-saira text-[0.65rem] m-0">
            <div className="mb-1">
              Created by {ensName || creatorAddress}
            </div>
            {createdAt && (
              <div className="text-[0.6rem] text-white/60 italic">
                {new Date(createdAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
