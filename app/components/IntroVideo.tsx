"use client";

import { useRef, useEffect } from "react";
import styles from "./IntroVideo.module.css";

interface IntroVideoProps {
  isVisible: boolean;
  onVideoEnd: () => void;
}

export default function IntroVideo({ isVisible, onVideoEnd }: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Preload and prepare video
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, []);

  // Play video when visible
  useEffect(() => {
    if (isVisible && videoRef.current) {
      videoRef.current.play();
    }
  }, [isVisible]);

  return (
    <video
      ref={videoRef}
      className={`${styles.video} ${isVisible ? styles.videoFadeIn : ''}`}
      src="/intro/intro.mp4"
      preload="auto"
      playsInline
      muted
      loop={false}
      onEnded={onVideoEnd}
    />
  );
}
