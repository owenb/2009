"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./Countdown.module.css";

interface CountdownProps {
  onComplete: () => void;
}

export default function Countdown({ onComplete }: CountdownProps) {
  // ===== TIMING VARIABLES - EASY TO ADJUST =====
  const TOTAL_DURATION = 2500; // Total time for countdown + scale (ms)
  const START_YEAR = 2025;
  const END_YEAR = 2009;
  const START_SCALE = 0.1;
  const END_SCALE = 1.1;
  // =============================================

  const [currentYear, setCurrentYear] = useState(START_YEAR);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isExploding, setIsExploding] = useState(false);
  const [scale, setScale] = useState(START_SCALE);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const flipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explosionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTriggeredExplosionRef = useRef(false);
  const currentYearRef = useRef(START_YEAR);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Ease-in-out function (cubic)
  const easeInOutCubic = (t: number): number => {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // Combined countdown, scaling, and easing loop
  useEffect(() => {
    const totalSteps = START_YEAR - END_YEAR;
    const animationStart = performance.now();

    currentYearRef.current = START_YEAR;
    hasTriggeredExplosionRef.current = false;
    setCurrentYear(START_YEAR);
    setScale(START_SCALE);
    setIsAnimating(false);
    setIsExploding(false);

    const step = (now: number) => {
      const elapsed = now - animationStart;
      const linearProgress = Math.min(elapsed / TOTAL_DURATION, 1);
      const easedProgress = easeInOutCubic(linearProgress);

      const nextScale = START_SCALE + easedProgress * (END_SCALE - START_SCALE);
      setScale(nextScale);

      const yearOffset = Math.floor(easedProgress * totalSteps);
      const nextYear = Math.max(END_YEAR, START_YEAR - yearOffset);

      if (nextYear !== currentYearRef.current) {
        currentYearRef.current = nextYear;
        setIsAnimating(true);
        setCurrentYear(nextYear);

        if (flipTimeoutRef.current) {
          clearTimeout(flipTimeoutRef.current);
        }
        flipTimeoutRef.current = setTimeout(() => {
          setIsAnimating(false);
        }, 40);
      }

      if (linearProgress >= 1) {
        if (!hasTriggeredExplosionRef.current) {
          hasTriggeredExplosionRef.current = true;
          setIsExploding(true);
          explosionTimeoutRef.current = setTimeout(() => {
            onCompleteRef.current?.();
          }, 400);
        }
        return;
      }

      animationFrameRef.current = requestAnimationFrame(step);
    };

    animationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (flipTimeoutRef.current) {
        clearTimeout(flipTimeoutRef.current);
      }
      if (explosionTimeoutRef.current) {
        clearTimeout(explosionTimeoutRef.current);
      }
    };
  }, [END_SCALE, START_SCALE, START_YEAR, END_YEAR, TOTAL_DURATION]);

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
