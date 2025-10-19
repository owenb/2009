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
            Bitcoin didn&apos;t turn out as we hoped. Instead of replacing fiat currency, it got co-opted by the very banks we hoped it would replace.
          </p>
          <p className={styles.subtitle}>
            Now we can travel back to 3 January 2009 and generate a new timeline, scene by scene.
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
                <span>We inject <strong>your ideas</strong> into the story arc</span>
              </li>
              <li>
                <span className={styles.icon}>⏱️</span>
                <span><strong>1 hour to generate</strong> your scene</span>
              </li>
              <li>
                <span className={styles.icon}>💰</span>
                <span>Apply for a <strong>50% refund</strong> if you fail to generate</span>
              </li>
              <li>
                <span className={styles.icon}>🌳</span>
                <span>Your scene becomes <strong>part of the infinite branching story</strong></span>
              </li>
            </ul>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Game Mechanics</h3>
            <ul className={styles.features}>
              <li>
                <span className={styles.icon}>💎</span>
                <span>Each scene costs <strong>0.007 ETH</strong> to generate</span>
              </li>
            </ul>

            <div className={styles.revenueModel}>
              <p className={styles.revenueIntro}>
                <strong>Earn as others build on your branch:</strong>
              </p>

              <div className={styles.revenueTree}>
                <div className={styles.revenueNode}>
                  <div className={styles.nodeBox} data-level="you">
                    <div className={styles.nodeLabel}>Your Scene</div>
                    <div className={styles.nodeCost}>-0.007 ETH</div>
                  </div>
                </div>

                <div className={styles.revenueLevel}>
                  <div className={styles.levelLabel}>Direct children (20% each)</div>
                  <div className={styles.nodeRow}>
                    {[1, 2, 3].map(i => (
                      <div key={`child-${i}`} className={styles.nodeBox} data-level="child">
                        <div className={styles.nodeReward}>+0.0014 ETH</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.revenueLevel}>
                  <div className={styles.levelLabel}>Grandchildren (10% each)</div>
                  <div className={styles.nodeGrid}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                      <div key={`grandchild-${i}`} className={styles.nodeBox} data-level="grandchild">
                        <div className={styles.nodeReward}>+0.0007</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.revenueLevel}>
                  <div className={styles.levelLabel}>Great-grandchildren (5% each)</div>
                  <div className={styles.dotIndicator}>• • •</div>
                  <div className={styles.nodeSmallText}>+0.00035 ETH each</div>
                </div>
              </div>

              <div className={styles.breakEvenNote}>
                <strong>Break even after ~7 follow-on scenes</strong> as your timeline evolves
              </div>
            </div>
          </div>

          <div className={styles.attribution}>
            Credits: 2009 is inspired by{' '}
            <a
              href="https://github.com/mshumer/interactive-sora"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.attributionLink}
            >
              Interactive Sora
            </a>
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
