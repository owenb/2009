import React from "react";

export default function StoryMapControls() {
  return (
    <div className="absolute bottom-8 left-8 bg-black/85 border-2 border-[#FFD700]/30 rounded-lg px-5 py-3 backdrop-blur-sm pointer-events-none">
      <p className="font-saira text-white/70 text-sm m-0">
        💡 Tap nodes to navigate • Pinch to zoom • Drag to pan (desktop)
      </p>
    </div>
  );
}
