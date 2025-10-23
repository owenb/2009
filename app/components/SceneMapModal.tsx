"use client";

import StoryMap from "./StoryMap";
import { useEscapeKey } from "@/hooks/useEscapeKey";

interface SceneMapModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSceneSelect: (sceneId: number) => void;
  currentSceneId?: number | null;
  movieId?: number;
  viewerAddress?: string | null;
}

export default function SceneMapModal({
  isVisible,
  onClose,
  onSceneSelect,
  currentSceneId,
  movieId = 1,
  viewerAddress = null
}: SceneMapModalProps) {
  // Handle ESC key to close
  useEscapeKey(onClose, isVisible);

  if (!isVisible) return null;

  const handleSceneSelect = (sceneId: number) => {
    onSceneSelect(sceneId);
    onClose();
  };

  const handleBackgroundClick = (e: React.MouseEvent) => {
    // Only close if clicking the background, not the content
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm overflow-hidden"
      onClick={handleBackgroundClick}
      style={{ touchAction: 'none' }}
    >
      {/* Header with Close Button */}
      <div className="absolute top-0 left-0 right-0 z-[250] px-4 sm:px-8 py-4 sm:py-6 bg-gradient-to-b from-black/95 to-transparent border-b border-[#FFD700]/20 pointer-events-none">
        <div className="flex items-center justify-between">
          <h2 className="font-saira text-xl sm:text-2xl font-bold text-[#FFD700] uppercase tracking-wide">
            Story Map
          </h2>
          <button
            className="pointer-events-auto bg-black/80 border-2 border-[#FFD700]/50 rounded-lg text-[#FFD700] text-xl sm:text-2xl w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center cursor-pointer hover:bg-[#FFD700]/20 hover:border-[#FFD700] transition-all active:scale-95"
            onClick={onClose}
            style={{ touchAction: 'auto' }}
            aria-label="Close Story Map"
          >
            ✕
          </button>
        </div>
        {/* Swipe hint for mobile */}
        <p className="font-saira text-white/50 text-xs sm:text-sm mt-2 text-center pointer-events-none">
          Tap X or press ESC to close
        </p>
      </div>

      {/* StoryMap Canvas */}
      <div
        className="w-full h-full pt-28 sm:pt-32 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'none' }}
      >
        <StoryMap
          movieId={movieId}
          currentSceneId={currentSceneId}
          viewerAddress={viewerAddress}
          onSceneSelect={handleSceneSelect}
        />
      </div>
    </div>
  );
}
