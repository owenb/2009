"use client";

import styles from "./ExtendStoryModal.module.css";

const SCENE_PRICE = process.env.NEXT_PUBLIC_SCENE_PRICE || "0.007";

interface ExtendStoryModalProps {
  isVisible: boolean;
  slot: 'A' | 'B' | 'C';
  onExtendClick: () => void;
  onClose: () => void;
}

export default function ExtendStoryModal({
  isVisible,
  slot,
  onExtendClick,
  onClose
}: ExtendStoryModalProps) {
  if (!isVisible) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Extend the Story</h2>

        <div className={styles.content}>
          <p className={styles.subtitle}>
            You&apos;re about to create slot <strong>{slot}</strong> — the next 8 seconds of this adventure.
          </p>

          <ul className={styles.features}>

            <li>
              <span className={styles.icon}>🌍</span>
              <span>Other players will <strong>discover &amp; explore</strong> your creation</span>
            </li>
             <li>
              <span className={styles.icon}>🎬</span>
              <span>We will deposit money to your wallet if other players choose to <strong>build on this scene</strong></span>
            </li>
     
            <li>
              <span className={styles.icon}>📝</span>
              <span>We'll combine your ideas with our own to ensure a good plot</span>
            </li>
            <li>
              <span className={styles.icon}>🤖</span>
              <span>You&apos;ll have <strong>1 hour</strong> enter your ideas</span>
            </li>
            <li>
              <span className={styles.icon}>💰</span>
              <span>If generation fails, you can apply for a <strong>50% refund</strong></span>
            </li>
          </ul>

          <button
            className={styles.ctaButton}
            onClick={onExtendClick}
          >
            Extend scene for {SCENE_PRICE} ETH
          </button>

          <button
            className={styles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
