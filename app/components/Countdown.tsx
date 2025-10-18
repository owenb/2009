"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./Countdown.module.css";

interface CountdownProps {
  onComplete: () => void;
}

export default function Countdown({ onComplete }: CountdownProps) {
  const [currentYear, setCurrentYear] = useState(2025);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isExploding, setIsExploding] = useState(false);
  const [scale, setScale] = useState(0.1);
  const startTimeRef = useRef<number>(0);
  const totalDuration = 4000; // Total animation duration in ms

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

  // Number countdown logic
  useEffect(() => {
    if (currentYear < 2009) return;

    if (currentYear === 2009) {
      // Trigger explosion effect
      const explosionTimer = setTimeout(() => {
        setIsExploding(true);
        // Notify parent that countdown is complete
        setTimeout(() => {
          onComplete();
        }, 600); // Wait for explosion animation to finish
      }, 500);
      return () => clearTimeout(explosionTimer);
    }

    // Calculate delay based on position in countdown with easing
    const progress = (2025 - currentYear) / (2025 - 2009);
    const easedSpeed = easeInOutCubic(progress);

    // Invert the easing so slower at beginning/end, faster in middle
    const minDelay = 20; // Fastest (middle)
    const maxDelay = 400; // Slowest (start/end)

    const delay = maxDelay - (easedSpeed * (maxDelay - minDelay));

    const timer = setTimeout(() => {
      setIsAnimating(true);
      // Change the number after a brief moment to allow animation
      setTimeout(() => {
        setCurrentYear(prev => prev - 1);
        setIsAnimating(false);
      }, 40);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentYear, onComplete]);

  return (
    <div
      className={`${styles.year} ${isAnimating ? styles.animating : ''} ${isExploding ? styles.exploding : ''}`}
      style={{
        transform: `scale(${scale})`,
        opacity: isExploding ? 0 : 1
      }}
    >
      {currentYear}
    </div>
  );
}
