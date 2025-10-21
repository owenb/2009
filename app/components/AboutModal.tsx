"use client";

import { useState, useRef } from "react";

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
    <div className="fixed top-0 left-0 w-screen h-screen bg-black/80 backdrop-blur-[5px] flex items-center justify-center z-[200] pointer-events-auto animate-fade-in" onClick={onClose}>
      <div
        className="w-[90%] max-w-[600px] max-h-[85vh] overflow-y-auto bg-black/85 border-[3px] border-white/30 rounded-xl p-8 md:p-6 sm:p-6 backdrop-blur-md shadow-[0_0_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] animate-[flyIn_0.5s_cubic-bezier(0.34,1.56,0.64,1)] relative touch-pan-y select-none sm:max-h-[90vh] sm:p-6"
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
        <div className="absolute top-0 left-1/2 -translate-x-1/2 py-3 w-full flex justify-center cursor-grab z-10 active:cursor-grabbing group">
          <div className="w-10 h-1 bg-white/30 rounded-sm transition-all duration-200 group-hover:bg-white/50"></div>
        </div>

        <h2 className="font-source-code text-[2rem] md:text-2xl sm:text-xl font-bold text-white text-center mt-6 mb-6 uppercase tracking-[0.1em]" style={{textShadow: '0 0 20px rgba(255, 255, 255, 0.5)'}}>About 2009</h2>

        <div className="flex flex-col gap-6">
          <p className="font-source-code text-base md:text-[0.9rem] sm:text-[0.85rem] text-white/90 text-center m-0 leading-relaxed">
            The first Bitcoin block was mined on 3 January 2009. If we could go back and create an alternative timeline, what would we do differently?
          </p>

          <div className="flex flex-col gap-4">
            <h3 className="font-source-code text-lg md:text-base sm:text-[0.95rem] font-bold text-[#FFD700] uppercase tracking-[0.05em] m-0 pb-2 border-b-2 border-[#FFD700]/30">How It Works</h3>
            <ul className="list-none p-0 m-0 flex flex-col gap-[0.85rem] sm:gap-[0.65rem]">
              <li className="flex items-start gap-3 font-source-code text-sm md:text-[0.85rem] sm:text-[0.8rem] text-white/85 leading-normal">
                <span className="text-xl sm:text-base flex items-center justify-center w-7 h-7 sm:w-6 sm:h-6 flex-shrink-0">🎬</span>
                <span>Watch <strong className="text-white font-bold">8-second video scenes</strong> that tell the story</span>
              </li>
              <li className="flex items-start gap-3 font-source-code text-sm md:text-[0.85rem] sm:text-[0.8rem] text-white/85 leading-normal">
                <span className="text-xl sm:text-base flex items-center justify-center w-7 h-7 sm:w-6 sm:h-6 flex-shrink-0">🔀</span>
                <span>Each scene has <strong className="text-white font-bold">3 extension slots</strong> (A, B, C)</span>
              </li>
              <li className="flex items-start gap-3 font-source-code text-sm md:text-[0.85rem] sm:text-[0.8rem] text-white/85 leading-normal">
                <span className="text-xl sm:text-base flex items-center justify-center w-7 h-7 sm:w-6 sm:h-6 flex-shrink-0">💎</span>
                <span><strong className="text-white font-bold">Purchase a slot</strong> to create what happens next</span>
              </li>
              <li className="flex items-start gap-3 font-source-code text-sm md:text-[0.85rem] sm:text-[0.8rem] text-white/85 leading-normal">
                <span className="text-xl sm:text-base flex items-center justify-center w-7 h-7 sm:w-6 sm:h-6 flex-shrink-0">🤖</span>
                <span>We inject <strong className="text-white font-bold">your ideas</strong> into the story arc</span>
              </li>
              <li className="flex items-start gap-3 font-source-code text-sm md:text-[0.85rem] sm:text-[0.8rem] text-white/85 leading-normal">
                <span className="text-xl sm:text-base flex items-center justify-center w-7 h-7 sm:w-6 sm:h-6 flex-shrink-0">⏱️</span>
                <span><strong className="text-white font-bold">1 hour to generate</strong> your scene</span>
              </li>
              <li className="flex items-start gap-3 font-source-code text-sm md:text-[0.85rem] sm:text-[0.8rem] text-white/85 leading-normal">
                <span className="text-xl sm:text-base flex items-center justify-center w-7 h-7 sm:w-6 sm:h-6 flex-shrink-0">💰</span>
                <span>Apply for a <strong className="text-white font-bold">50% refund</strong> if you fail to generate</span>
              </li>
              <li className="flex items-start gap-3 font-source-code text-sm md:text-[0.85rem] sm:text-[0.8rem] text-white/85 leading-normal">
                <span className="text-xl sm:text-base flex items-center justify-center w-7 h-7 sm:w-6 sm:h-6 flex-shrink-0">🌳</span>
                <span>Your scene becomes <strong className="text-white font-bold">part of the infinite branching story</strong></span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="font-source-code text-lg md:text-base sm:text-[0.95rem] font-bold text-[#FFD700] uppercase tracking-[0.05em] m-0 pb-2 border-b-2 border-[#FFD700]/30">Game Mechanics</h3>
            <ul className="list-none p-0 m-0 flex flex-col gap-[0.85rem] sm:gap-[0.65rem]">
              <li className="flex items-start gap-3 font-source-code text-sm md:text-[0.85rem] sm:text-[0.8rem] text-white/85 leading-normal">
                <span className="text-xl sm:text-base flex items-center justify-center w-7 h-7 sm:w-6 sm:h-6 flex-shrink-0">💎</span>
                <span>Each scene costs <strong className="text-white font-bold">0.007 ETH</strong> to generate</span>
              </li>
            </ul>

            <div className="mt-4 p-6 md:p-4 sm:p-3 bg-[#FFD700]/5 border-2 border-[#FFD700]/20 rounded-lg">
              <p className="font-source-code text-sm md:text-[0.9rem] sm:text-[0.8rem] text-white/90 text-center m-0 mb-6">
                <strong>Earn as others build on your branch:</strong>
              </p>

              <div className="flex flex-col gap-6 items-center">
                <div className="flex justify-center">
                  <div className="font-source-code text-xs p-2 px-3 rounded min-w-[80px] text-center bg-red-500/20 border-2 border-red-500/50 text-red-200 transition-all duration-200">
                    <div className="font-semibold mb-1">Your Scene</div>
                    <div className="font-bold text-red-300">-0.007 ETH</div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center w-full">
                  <div className="font-source-code text-xs md:text-[0.75rem] sm:text-[0.7rem] text-[#FFD700]/80 text-center mb-1">Direct children (20% each)</div>
                  <div className="flex gap-3 justify-center flex-wrap">
                    {[1, 2, 3].map(i => (
                      <div key={`child-${i}`} className="font-source-code text-xs p-2 px-3 rounded min-w-[80px] text-center bg-green-500/15 border border-green-500/40 text-green-200 transition-all duration-200">
                        <div className="font-bold text-green-300">+0.0014 ETH</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center w-full">
                  <div className="font-source-code text-xs md:text-[0.75rem] sm:text-[0.7rem] text-[#FFD700]/80 text-center mb-1">Grandchildren (10% each)</div>
                  <div className="grid grid-cols-3 gap-2 max-w-[280px] md:max-w-[240px] sm:max-w-[200px]">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                      <div key={`grandchild-${i}`} className="font-source-code text-[0.7rem] sm:text-[0.6rem] p-[0.4rem] px-2 sm:p-[0.3rem] sm:px-[0.35rem] rounded min-w-[60px] sm:min-w-[45px] text-center bg-blue-400/15 border border-blue-400/30 text-blue-200 transition-all duration-200">
                        <div className="font-bold text-blue-300">+0.0007</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center w-full">
                  <div className="font-source-code text-xs md:text-[0.75rem] sm:text-[0.65rem] text-[#FFD700]/80 text-center mb-1">Great-grandchildren (5% each)</div>
                  <div className="text-2xl text-[#FFD700]/40 tracking-[0.5rem] my-2">• • •</div>
                  <div className="font-source-code text-[0.7rem] text-white/60">+0.00035 ETH each</div>
                </div>
              </div>

              <div className="font-source-code text-[0.85rem] sm:text-xs text-[#FFD700] text-center mt-6 pt-4 border-t border-[#FFD700]/20">
                <strong>Break even after ~7 follow-on scenes</strong> as your timeline evolves
              </div>
            </div>
          </div>

          <div className="font-source-code text-[0.8rem] sm:text-[0.7rem] text-white/50 text-center leading-normal">
            Credit: 2009 is inspired by{' '}
            <a
              href="https://github.com/mshumer/interactive-sora"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#FFD700]/70 no-underline transition-colors duration-200 hover:text-[#FFD700] hover:underline"
            >
              Interactive Sora
            </a>
          </div>

          <button
            className="font-source-code text-base md:text-[0.95rem] sm:text-[0.9rem] font-bold uppercase tracking-[0.05em] text-black rounded-lg px-8 py-4 md:px-6 md:py-[0.9rem] sm:px-5 sm:py-[0.85rem] cursor-pointer transition-all duration-200 border-none mt-2 hover:-translate-y-0.5 active:translate-y-0"
            style={{
              background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
              boxShadow: '0 0 20px rgba(255, 215, 0, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 0 30px rgba(255, 215, 0, 0.6)';
              e.currentTarget.style.background = 'linear-gradient(135deg, #FFE44D 0%, #FFB84D 100%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.4)';
              e.currentTarget.style.background = 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)';
            }}
            onClick={onClose}
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
