"use client";

import { useEffect, useState, useRef } from "react";

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
      <div key={node.id} className="flex flex-col items-center relative">
        {/* Current node - circular */}
        <div
          className={`flex flex-col items-center gap-2 p-4 md:p-[0.65rem] rounded-full w-20 h-20 cursor-pointer transition-all duration-200 relative z-[2] ${
            isCurrent
              ? 'bg-[#FFD700]/15 border-2 border-[#FFD700]/60 shadow-[0_0_20px_rgba(255,215,0,0.4)] hover:bg-[#FFD700]/20 hover:border-[#FFD700]/80'
              : 'bg-white/5 border-2 border-white/20 hover:bg-white/10 hover:border-[#FFD700]/40 hover:scale-110 hover:shadow-[0_0_20px_rgba(255,215,0,0.3)]'
          } ${isGenesis ? 'text-2xl' : ''}`}
          onClick={() => onSceneSelect(node.id)}
          title={isGenesis ? 'Genesis - Intro' : `Slot ${node.slot}: ${node.slotLabel || 'Scene'}`}
        >
          {/* Slot indicator or emoji for genesis */}
          {isGenesis ? (
            <span>🎬</span>
          ) : (
            <div className="text-2xl font-bold text-[#FFD700]">
              {node.slot}
            </div>
          )}

          {/* Current indicator */}
          {isCurrent && (
            <div className="absolute -top-2.5 -right-2.5 bg-[#FFD700]/30 border border-[#FFD700]/60 rounded px-[0.35rem] py-[0.15rem] text-[0.6rem] font-bold text-[#FFD700] uppercase tracking-[0.05em] z-[3]">
              YOU
            </div>
          )}
        </div>

        {/* Children - horizontal layout below */}
        {hasChildren && (
          <div className="flex justify-center gap-8 mt-12 relative before:content-[''] before:absolute before:-top-12 before:left-1/2 before:w-0.5 before:h-8 before:bg-[#FFD700]/30 before:-translate-x-1/2">
            {node.children.map((child) => (
              <div key={child.id} className="relative flex flex-col items-center before:content-[''] before:absolute before:-top-8 before:left-1/2 before:w-0.5 before:h-8 before:bg-[#FFD700]/30 before:-translate-x-1/2">
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
    <div className="fixed top-0 left-0 w-screen h-screen bg-black/70 backdrop-blur-[5px] z-[150] flex items-center justify-center animate-fade-in pointer-events-auto">
      <div className="w-[90%] max-w-[600px] max-h-[80vh] bg-black/85 border-[3px] border-white/30 rounded-xl backdrop-blur-md shadow-[0_0_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] animate-[flyIn_0.5s_cubic-bezier(0.34,1.56,0.64,1)] flex flex-col overflow-hidden sm:w-full sm:max-w-full sm:max-h-screen sm:rounded-none" ref={modalRef}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 md:px-6 md:py-4 sm:px-4 sm:py-4 border-b-2 border-white/20">
          <h2 className="font-source-code text-2xl md:text-xl sm:text-lg font-bold text-[#FFD700] uppercase tracking-[0.1em] m-0">Story Map</h2>
          <button
            className="bg-transparent border-2 border-white/30 rounded-md text-white/70 text-2xl w-10 h-10 flex items-center justify-center cursor-pointer transition-all duration-200 hover:border-white/60 hover:text-white hover:bg-white/10"
            onClick={onClose}
            aria-label="Close map"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 md:p-6 sm:p-4">
          {isLoading ? (
            <div className="flex items-center justify-center min-h-[200px] font-source-code text-white/70 text-base">
              <p>Loading map...</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center min-h-[200px] font-source-code text-[#FF6B6B] text-base">
              <p>{error}</p>
            </div>
          ) : tree ? (
            <div className="font-source-code flex flex-col items-center gap-12 p-4 min-w-full">
              {renderNode(tree)}
            </div>
          ) : (
            <div className="flex items-center justify-center min-h-[200px] font-source-code text-white/70 text-base">
              <p>No scenes found</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 md:px-6 md:py-4 sm:px-4 sm:py-3 border-t-2 border-white/20 bg-black/30">
          <p className="font-source-code text-[0.85rem] sm:text-[0.8rem] text-white/60 m-0 text-center">
            Click any scene to jump there
          </p>
        </div>
      </div>
    </div>
  );
}
