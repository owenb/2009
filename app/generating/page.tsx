"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useComposeCast } from "@coinbase/onchainkit/minikit";

function GeneratingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { composeCast } = useComposeCast();

  const promptId = searchParams.get('promptId');
  const sceneId = searchParams.get('sceneId');

  const [status, setStatus] = useState<string>('queued');
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  const [completedSceneId, setCompletedSceneId] = useState<string | null>(null);

  // Complete generation function
  const completeGeneration = useCallback(async (promptIdParam: string, videoJobId: string) => {
    try {
      setProgress(95);
      setStatus('Finalizing...');

      const response = await fetch('/api/generation/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptId: parseInt(promptIdParam),
          videoJobId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete generation');
      }

      const data = await response.json();
      console.log('Generation completed:', data);

      setProgress(100);
      setStatus('Complete!');
      setCompletedSceneId(data.sceneId);

      // Show share prompt after a brief moment
      setTimeout(() => {
        setShowSharePrompt(true);
      }, 1000);

    } catch (err) {
      console.error('Error completing generation:', err);
      setError((err as Error).message);
    }
  }, []);

  // Poll for status every 5 seconds
  useEffect(() => {
    if (!promptId) {
      setError('No prompt ID provided');
      return;
    }

    let isMounted = true;
    let pollCount = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/generation/poll?promptId=${promptId}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to poll status');
        }

        const data = await response.json();

        if (!isMounted) return;

        console.log('Poll response:', data);

        setStatus(data.status);
        pollCount++;

        // Update progress bar (fake progress for UX)
        if (data.status === 'queued') {
          setProgress(Math.min(10 + pollCount * 2, 20));
        } else if (data.status === 'in_progress') {
          setProgress(Math.min(20 + pollCount * 3, 80));
        } else if (data.status === 'completed') {
          setProgress(90);

          // Video is ready! Call complete endpoint to download and upload to R2
          await completeGeneration(promptId, data.videoJobId);
        } else if (data.status === 'failed') {
          setError(data.error || 'Video generation failed');
          setCanRetry(data.canRetry || false);
        }

      } catch (err) {
        console.error('Error polling:', err);
        if (isMounted) {
          setError((err as Error).message);
        }
      }
    };

    // Initial poll
    poll();

    // Poll every 5 seconds
    const interval = setInterval(poll, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [promptId, completeGeneration]);

  // Handle sharing the completed scene
  const handleShare = () => {
    const sceneUrl = `${process.env.NEXT_PUBLIC_URL || window.location.origin}/scene/${completedSceneId}`;
    composeCast({
      text: `Just created a new timeline in 2009! What happens when Bitcoin's story changes? 🎬✨`,
      embeds: [sceneUrl]
    });
    // Redirect to home after sharing
    setTimeout(() => router.push('/'), 500);
  };

  const handleSkipShare = () => {
    router.push('/');
  };

  // Show share prompt modal
  if (showSharePrompt) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8 md:p-4 font-saira">
        <div className="bg-black/85 backdrop-blur-md rounded-xl border-[3px] border-white/30 p-8 max-w-[600px] w-full shadow-[0_0_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] text-center md:p-6">
          <div className="text-6xl mb-4 animate-bounce">🎉</div>
          <h1 className="text-[2rem] md:text-2xl font-bold text-white my-0 mb-6">Scene Created!</h1>
          <p className="text-lg text-[#FFD700] m-0 font-bold uppercase tracking-wide mb-6">
            Your scene is ready to share with the world
          </p>

          <div className="flex gap-4 justify-center flex-wrap md:flex-col md:gap-2">
            <button
              className="font-saira text-lg md:text-base font-bold text-black border-none rounded-lg py-5 px-8 md:py-4 cursor-pointer transition-all duration-200 uppercase tracking-[0.05em] mx-2 md:mx-0 md:my-2 md:w-full hover:-translate-y-0.5 active:translate-y-0"
              onClick={handleShare}
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                boxShadow: '0 0 20px rgba(102, 126, 234, 0.4)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 0 30px rgba(102, 126, 234, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 0 20px rgba(102, 126, 234, 0.4)';
              }}
            >
              Share Your Creation
            </button>
            <button
              className="font-saira text-sm text-white/60 bg-transparent border-2 border-white/20 rounded-lg py-3 px-6 cursor-pointer transition-all duration-200 uppercase tracking-[0.05em] mx-2 md:mx-0 md:my-2 md:w-full hover:text-white/90 hover:border-white/40 hover:bg-white/5"
              onClick={handleSkipShare}
            >
              Skip for Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8 md:p-4 font-saira">
        <div className="bg-black/85 backdrop-blur-md rounded-xl border-[3px] border-white/30 p-8 max-w-[600px] w-full shadow-[0_0_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] text-center md:p-6">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-[2rem] md:text-2xl font-bold text-[#FF6B6B] my-0 mb-4">Generation Failed</h1>
          <p className="text-white/90 text-base mb-8 leading-relaxed">{error}</p>

          {canRetry && (
            <button
              className="font-saira text-lg md:text-base font-bold text-black rounded-lg py-5 px-8 md:py-4 cursor-pointer transition-all duration-200 border-none uppercase tracking-[0.05em] mx-2 md:mx-0 md:my-2 md:w-full hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                boxShadow: '0 0 20px rgba(255, 215, 0, 0.4)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 0 30px rgba(255, 215, 0, 0.6)';
                e.currentTarget.style.background = 'linear-gradient(135deg, #FFE44D 0%, #FFB84D 100%)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.4)';
                e.currentTarget.style.background = 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)';
              }}
              onClick={() => router.push(`/create?attemptId=${searchParams.get('attemptId')}&sceneId=${sceneId}`)}
            >
              Try Again
            </button>
          )}

          <button
            className="font-saira text-sm text-white/60 bg-transparent border-2 border-white/20 rounded-lg py-3 px-6 cursor-pointer transition-all duration-200 uppercase tracking-[0.05em] mx-2 md:mx-0 md:my-2 md:w-full hover:text-white/90 hover:border-white/40 hover:bg-white/5"
            onClick={() => router.push('/')}
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-8 md:p-4 font-saira">
      <div className="bg-black/85 backdrop-blur-md rounded-xl border-[3px] border-white/30 p-8 max-w-[600px] w-full shadow-[0_0_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] text-center md:p-6">
        <div className="relative w-[150px] h-[150px] md:w-[120px] md:h-[120px] mx-auto mb-8">
          <div className="absolute w-full h-full border-[3px] border-transparent border-t-[#FFD700] rounded-full animate-spin"></div>
          <div className="absolute w-[80%] h-[80%] top-[10%] left-[10%] border-[3px] border-transparent border-t-[#FFA500] rounded-full animate-spin [animation-duration:1.5s] [animation-direction:reverse]"></div>
          <div className="absolute w-[60%] h-[60%] top-[20%] left-[20%] border-[3px] border-transparent border-t-[#FFE44D] rounded-full animate-spin [animation-duration:1s]"></div>
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[2rem] md:text-2xl font-bold text-[#FFD700]" style={{textShadow: '0 0 20px rgba(255, 215, 0, 0.5)'}}>2009</span>
        </div>

        <h1 className="text-[2rem] md:text-2xl font-bold text-white my-0 mb-6">Creating Your Scene</h1>

        <div className="mb-8">
          <p className="text-lg text-[#FFD700] m-0 font-bold uppercase tracking-wide">
            {status === 'queued' && 'In queue...'}
            {status === 'in_progress' && 'Generating video...'}
            {status === 'completed' && 'Processing...'}
            {status === 'Finalizing...' && 'Finalizing...'}
            {status === 'Complete!' && 'Complete!'}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-3 bg-white/10 rounded-lg overflow-hidden mb-8">
          <div
            className="h-full rounded-lg transition-all duration-500 shadow-[0_0_20px_rgba(255,215,0,0.5)]"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #FFD700, #FFA500)'
            }}
          ></div>
        </div>

        <div className="mb-8">
          <p className="text-white text-base m-0 mb-2">
            This usually takes 2-4 minutes. Hang tight!
          </p>
          <p className="text-white/60 text-sm m-0">
            We&apos;re using Sora 2 to generate your 8-second video scene set in 2009.
          </p>
        </div>

        {/* Fun facts while waiting */}
        <div className="bg-[#FFD700]/5 border-2 border-[#FFD700]/20 rounded-lg p-6 mt-8 md:p-4">
          <p className="text-[#FFD700] text-sm font-bold m-0 mb-3 uppercase tracking-[0.05em]">Did you know?</p>
          <p className="text-white/80 text-sm leading-relaxed m-0">
            In 2009, Bitcoin&apos;s first block (the &quot;Genesis Block&quot;) was mined on January 3rd,
            marking the birth of cryptocurrency as we know it today.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GeneratingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center p-8 md:p-4 font-saira">
        <div className="bg-black/85 backdrop-blur-md rounded-xl border-[3px] border-white/30 p-8 max-w-[600px] w-full shadow-[0_0_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] text-center md:p-6">
          <div className="relative w-[150px] h-[150px] md:w-[120px] md:h-[120px] mx-auto mb-8">
            <div className="absolute w-full h-full border-[3px] border-transparent border-t-[#FFD700] rounded-full animate-spin"></div>
            <div className="absolute w-[80%] h-[80%] top-[10%] left-[10%] border-[3px] border-transparent border-t-[#FFA500] rounded-full animate-spin [animation-duration:1.5s] [animation-direction:reverse]"></div>
            <div className="absolute w-[60%] h-[60%] top-[20%] left-[20%] border-[3px] border-transparent border-t-[#FFE44D] rounded-full animate-spin [animation-duration:1s]"></div>
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[2rem] md:text-2xl font-bold text-[#FFD700]" style={{textShadow: '0 0 20px rgba(255, 215, 0, 0.5)'}}>2009</span>
          </div>
          <h1 className="text-[2rem] md:text-2xl font-bold text-white my-0 mb-6">Loading...</h1>
        </div>
      </div>
    }>
      <GeneratingPageContent />
    </Suspense>
  );
}
