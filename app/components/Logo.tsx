'use client';

export default function Logo() {
  return (
    <div className="flex flex-col gap-2" style={{ transform: 'scale(0.5)', transformOrigin: 'center' }}>
      {/* Top row: BASED */}
      <div className="flex gap-2">
        {['B', 'A', 'S', 'E', 'D'].map((letter, i) => (
          <div
            key={`top-${i}`}
            className="w-16 h-16 border-2 border-white bg-white flex items-center justify-center opacity-0"
            style={{
              animation: `fadeInScale 300ms ease-out ${i * 50}ms forwards`
            }}
          >
            <span className="font-saira font-black text-4xl text-black">
              {letter}
            </span>
          </div>
        ))}
      </div>

      {/* Bottom row: ON + 3 empty boxes */}
      <div className="flex gap-2">
        {['O', 'N'].map((letter, i) => (
          <div
            key={`bottom-${i}`}
            className="w-16 h-16 border-2 border-white bg-white flex items-center justify-center opacity-0"
            style={{
              animation: `fadeInScale 300ms ease-out ${(i + 5) * 50}ms forwards`
            }}
          >
            <span className="font-saira font-black text-4xl text-black">
              {letter}
            </span>
          </div>
        ))}
        {[1, 2, 3].map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-16 h-16 border-2 border-white/20 bg-white/5 opacity-0"
            style={{
              animation: `fadeInScale 300ms ease-out ${(i + 7) * 50}ms forwards`
            }}
          />
        ))}
      </div>

      <style jsx>{`
        @keyframes fadeInScale {
          0% {
            opacity: 0;
            transform: scale(0.5);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
