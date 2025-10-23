"use client";

import StoryMap from "./StoryMap";

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
  if (!isVisible) return null;

  const handleSceneSelect = (sceneId: number) => {
    onSceneSelect(sceneId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 px-8 py-6 bg-gradient-to-b from-black/95 to-transparent border-b border-[#FFD700]/20">
        <div className="flex items-center justify-between">
          <h2 className="font-saira text-2xl font-bold text-[#FFD700] uppercase tracking-wide">
            Story Map
          </h2>
          <button
            className="bg-black/60 border-2 border-white/30 rounded-lg text-white text-xl w-12 h-12 flex items-center justify-center cursor-pointer hover:border-[#FFD700] transition-colors"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>

      {/* StoryMap Canvas */}
      <div className="w-full h-full pt-24">
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
