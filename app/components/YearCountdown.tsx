"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./YearCountdown.module.css";

export default function YearCountdown() {
  const [currentYear, setCurrentYear] = useState(2025);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isExploding, setIsExploding] = useState(false);
  const [scale, setScale] = useState(0.1);
  const [videoFadeIn, setVideoFadeIn] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const videoRef = useRef<HTMLVideoElement>(null);
  const totalDuration = 4000; // Total animation duration in ms

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

  return (
    <div className={styles.container}>
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

            <div className={styles.choicesContainer}>
              <div className={styles.choice}>
                <div className={styles.choiceLabel}>A</div>
                <div className={styles.choiceText}>walk to the bedroom</div>
              </div>

              <div className={styles.choice}>
                <div className={styles.choiceLabel}>B</div>
                <div className={styles.choiceText}>make cup of tea</div>
              </div>

              <div className={styles.choice}>
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
