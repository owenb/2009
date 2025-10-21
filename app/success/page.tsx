"use client";

import { useComposeCast } from '@coinbase/onchainkit/minikit';
import { minikitConfig } from "../../minikit.config";

export default function Success() {

  const { composeCastAsync } = useComposeCast();

  const handleShare = async () => {
    try {
      const text = `Yay! I just joined the waitlist for ${minikitConfig.miniapp.name.toUpperCase()}! `;

      const result = await composeCastAsync({
        text: text,
        embeds: [process.env.NEXT_PUBLIC_URL || ""]
      });

      // result.cast can be null if user cancels
      if (result?.cast) {
        console.log("Cast created successfully:", result.cast.hash);
      } else {
        console.log("User cancelled the cast");
      }
    } catch (error) {
      console.error("Error sharing cast:", error);
    }
  };

  return (
    <div className="flex flex-col min-h-screen text-white relative" style={{background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)'}}>
      <button className="absolute top-4 right-4 bg-transparent border-2 border-white/30 text-white w-10 h-10 rounded-full cursor-pointer flex items-center justify-center text-xl transition-all duration-300 hover:bg-white/10 hover:border-white/50" type="button">
        ✕
      </button>

      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <div className="text-center max-w-[600px] w-full">
          <div className="mx-auto mb-8 w-20 h-20">
            <div className="w-20 h-20 rounded-full border-[3px] border-[#4CAF50] relative animate-checkmark-circle">
              <div className="absolute w-[3px] h-5 bg-[#4CAF50] left-[35px] top-8 origin-bottom animate-checkmark-stem"></div>
              <div className="absolute w-[3px] h-3 bg-[#4CAF50] left-7 top-11 origin-bottom animate-checkmark-kick"></div>
            </div>
          </div>

          <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-bold -tracking-[0.02em] mb-8 bg-[linear-gradient(135deg,#4CAF50_0%,#66BB6A_100%)] bg-clip-text [-webkit-background-clip:text] [-webkit-text-fill-color:transparent]" style={{textShadow: '0 0 30px rgba(76, 175, 80, 0.3)'}}>
            Welcome to the {minikitConfig.miniapp.name.toUpperCase()}!
          </h1>

          <p className="text-xl leading-relaxed mb-12 text-white/80 font-light">
            You&apos;re in! We&apos;ll notify you as soon as we launch.<br />
            Get ready to experience the future of onchain marketing.
          </p>

          <button onClick={handleShare} className="bg-[#f7d954] text-black border-none py-4 px-12 text-base font-bold rounded-xl cursor-pointer transition-all duration-300 uppercase tracking-wide mt-4 shadow-[0_4px_20px_rgba(247,217,84,0.3)] hover:bg-[#f5d73a] hover:-translate-y-0.5 hover:shadow-[0_6px_25px_rgba(247,217,84,0.4)]">
            SHARE
          </button>
        </div>
      </div>
    </div>
  );
}
