"use client";

import { useState, useRef } from "react";
import styles from "./AboutModal.module.css";

interface AboutModalProps {
  isVisible: boolean;
  onClose: () => void;
}

export default function AboutModal({
  isVisible,
  onClose
}: AboutModalProps) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    // Only allow dragging down
    if (diff > 0) {
      setDragY(diff);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    // If dragged more than 100px, close the modal
    if (dragY > 100) {
      onClose();
    }
    setDragY(0);
  };

  if (!isVisible) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease-out'
        }}
      >
        {/* Drag handle indicator */}
        <div className={styles.dragHandle}>
          <div className={styles.dragBar}></div>
        </div>

        <h2 className={styles.title}>About 2009</h2>

        <div className={styles.content}>
          <p className={styles.subtitle}>
            A collaborative <strong>create-your-own-adventure</strong> game where every player shapes the story.
          </p>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>How It Works</h3>
            <ul className={styles.features}>
              <li>
                <span className={styles.icon}>🎬</span>
                <span>Watch <strong>8-second video scenes</strong> that tell the story</span>
              </li>
              <li>
                <span className={styles.icon}>🔀</span>
                <span>Each scene has <strong>3 extension slots</strong> (A, B, C)</span>
              </li>
              <li>
                <span className={styles.icon}>💎</span>
                <span><strong>Purchase a slot</strong> to create what happens next</span>
              </li>
              <li>
                <span className={styles.icon}>🤖</span>
                <span>Write a prompt — <strong>AI generates your 8-second scene</strong></span>
              </li>
              <li>
                <span className={styles.icon}>🌳</span>
                <span>Your scene becomes <strong>part of the infinite branching story</strong></span>
              </li>
            </ul>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>The Story</h3>
            <p className={styles.description}>
              It&apos;s <strong>2009</strong>. Bitcoin has just been launched. Navigate this pivotal moment in history and help shape an infinite timeline of possibilities.
            </p>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Your Creations</h3>
            <ul className={styles.features}>
              <li>
                <span className={styles.icon}>♾️</span>
                <span><strong>Live forever</strong> in the game world</span>
              </li>
              <li>
                <span className={styles.icon}>🌍</span>
                <span><strong>Discovered by other players</strong> exploring different paths</span>
              </li>
              <li>
                <span className={styles.icon}>⏱️</span>
                <span><strong>1 hour to generate</strong> with unlimited retries</span>
              </li>
              <li>
                <span className={styles.icon}>💰</span>
                <span><strong>50% refund</strong> if generation fails</span>
              </li>
            </ul>
          </div>

          <button
            className={styles.closeButton}
            onClick={onClose}
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
