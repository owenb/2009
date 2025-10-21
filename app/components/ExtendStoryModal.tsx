"use client";

const SCENE_PRICE = process.env.NEXT_PUBLIC_SCENE_PRICE || "0.007";

interface ExtendStoryModalProps {
  isVisible: boolean;
  slot: 'A' | 'B' | 'C';
  onExtendClick: () => void;
  onClose: () => void;
}

export default function ExtendStoryModal({
  isVisible,
  slot: _slot,
  onExtendClick,
  onClose
}: ExtendStoryModalProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed top-0 left-0 w-screen h-screen bg-black/70 backdrop-blur-[5px] flex items-center justify-center z-[100] pointer-events-auto animate-fade-in" onClick={onClose}>
      <div className="w-[90%] max-w-[500px] bg-black/85 border-[3px] border-white/30 rounded-xl p-8 md:p-6 sm:p-6 backdrop-blur-md shadow-[0_0_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] animate-[flyIn_0.5s_cubic-bezier(0.34,1.56,0.64,1)]" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-source-code text-[2rem] md:text-2xl sm:text-xl font-bold text-white text-center m-0 mb-6 uppercase tracking-[0.1em]" style={{textShadow: '0 0 20px rgba(255, 255, 255, 0.5)'}}>
          Extend the Story
        </h2>

        <div className="flex flex-col gap-6">
          <p className="font-source-code text-base md:text-sm text-white/90 text-center m-0 leading-relaxed">
            Want to create the next 8 seconds of this story?
          </p>

          <ul className="list-none p-0 m-0 flex flex-col gap-4">
            <li className="flex items-start gap-3 font-source-code text-sm md:text-[0.85rem] text-white/85 leading-relaxed">
              <span className="text-xl flex items-center justify-center w-7 h-7 flex-shrink-0">🌍</span>
              <span>Other players will <strong className="text-white font-bold">discover &amp; explore</strong> your creation</span>
            </li>
            <li className="flex items-start gap-3 font-source-code text-sm md:text-[0.85rem] text-white/85 leading-relaxed">
              <span className="text-xl flex items-center justify-center w-7 h-7 flex-shrink-0">🎬</span>
              <span>We will deposit money to your wallet if other players choose to <strong className="text-white font-bold">build on this scene</strong></span>
            </li>
            <li className="flex items-start gap-3 font-source-code text-sm md:text-[0.85rem] text-white/85 leading-relaxed">
              <span className="text-xl flex items-center justify-center w-7 h-7 flex-shrink-0">📝</span>
              <span>We&apos;ll combine your ideas with our own to ensure a good plot</span>
            </li>
            <li className="flex items-start gap-3 font-source-code text-sm md:text-[0.85rem] text-white/85 leading-relaxed">
              <span className="text-xl flex items-center justify-center w-7 h-7 flex-shrink-0">🤖</span>
              <span>You&apos;ll have <strong className="text-white font-bold">1 hour</strong> enter your ideas</span>
            </li>
            <li className="flex items-start gap-3 font-source-code text-sm md:text-[0.85rem] text-white/85 leading-relaxed">
              <span className="text-xl flex items-center justify-center w-7 h-7 flex-shrink-0">💰</span>
              <span>If generation fails, you can apply for a <strong className="text-white font-bold">50% refund</strong></span>
            </li>
          </ul>

          <button
            className="font-source-code text-lg md:text-base font-bold uppercase tracking-wider text-black rounded-lg px-8 py-5 md:py-4 cursor-pointer transition-all duration-200 border-none mt-2 hover:-translate-y-0.5 active:translate-y-0"
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
            onClick={onExtendClick}
          >
            Extend scene for {SCENE_PRICE} ETH
          </button>

          <button
            className="font-source-code text-sm md:text-xs text-white/60 bg-transparent border-2 border-white/20 rounded-lg px-6 py-3 md:py-2.5 cursor-pointer transition-all duration-200 hover:text-white/90 hover:border-white/40 hover:bg-white/5"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
