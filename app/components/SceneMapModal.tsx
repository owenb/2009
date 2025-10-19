"use client";

import { useEffect, useState, useRef } from "react";
import styles from "./SceneMapModal.module.css";

interface SceneNode {
  id: number;
  parentId: number | null;
  slot: 'A' | 'B' | 'C' | null;
  slotLabel: string | null;
  status: string;
  creatorAddress: string | null;
  viewCount: number;
  children: SceneNode[];
}

interface SceneMapModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSceneSelect: (sceneId: number) => void;
  currentSceneId?: number | null;
}

export default function SceneMapModal({
  isVisible,
  onClose,
  onSceneSelect,
  currentSceneId
}: SceneMapModalProps) {
  const [tree, setTree] = useState<SceneNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch scene tree when modal opens
  useEffect(() => {
    if (!isVisible) return;

    const fetchTree = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/scenes/tree');
        if (!response.ok) {
          throw new Error('Failed to fetch scene tree');
        }

        const data = await response.json();
        setTree(data.tree);
      } catch (err) {
        console.error('Error fetching scene tree:', err);
        setError('Failed to load scene map');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTree();
  }, [isVisible]);

  // Handle click outside modal to close
  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible, onClose]);

  // Render a scene node and its children recursively as Merkle tree
  const renderNode = (node: SceneNode) => {
    const isCurrent = currentSceneId === node.id;
    const isGenesis = node.id === 0;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id} className={styles.nodeContainer}>
        {/* Current node - circular */}
        <div
          className={`${styles.node} ${isCurrent ? styles.nodeCurrent : ''} ${isGenesis ? styles.nodeGenesis : ''}`}
          onClick={() => onSceneSelect(node.id)}
          title={isGenesis ? 'Genesis - Intro' : `Slot ${node.slot}: ${node.slotLabel || 'Scene'}`}
        >
          {/* Slot indicator or emoji for genesis */}
          {isGenesis ? (
            <span>🎬</span>
          ) : (
            <div className={styles.nodeSlot}>
              {node.slot}
            </div>
          )}

          {/* Current indicator */}
          {isCurrent && (
            <div className={styles.nodeBadge}>
              YOU
            </div>
          )}
        </div>

        {/* Children - horizontal layout below */}
        {hasChildren && (
          <div className={styles.nodeChildren}>
            {node.children.map((child) => (
              <div key={child.id} className={styles.childWrapper}>
                {renderNode(child)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!isVisible) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} ref={modalRef}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Story Map</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close map"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {isLoading ? (
            <div className={styles.loading}>
              <p>Loading map...</p>
            </div>
          ) : error ? (
            <div className={styles.error}>
              <p>{error}</p>
            </div>
          ) : tree ? (
            <div className={styles.tree}>
              {renderNode(tree)}
            </div>
          ) : (
            <div className={styles.empty}>
              <p>No scenes found</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <p className={styles.hint}>
            Click any scene to jump there
          </p>
        </div>
      </div>
    </div>
  );
}
