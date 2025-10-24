"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useComposeCast } from "@coinbase/onchainkit/minikit";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { MovieThemeProvider } from "@/app/components/MovieThemeProvider";
import { MovieColorScheme, DEFAULT_COLOR_SCHEME } from "@/app/types/movie";
import type { Movie } from "@/lib/db/types";
import VideoAdventureABI from '@/lib/VideoAdventure.abi.json';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

interface GeneratingPageProps {
  params: Promise<{
    slug: string;
  }>;
}

function GeneratingPageContent({ movieSlug }: { movieSlug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { composeCast } = useComposeCast();

  const promptId = searchParams.get('promptId');
  const sceneId = searchParams.get('sceneId');
  const attemptId = searchParams.get('attemptId');

  const [status, setStatus] = useState<string>('queued');
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  const [completedSceneId, setCompletedSceneId] = useState<string | null>(null);
  const [movieData, setMovieData] = useState<Movie | null>(null);

  // New state for escrow confirmation flow
  const [confirmationState, setConfirmationState] = useState<'ready' | 'confirming' | 'confirmed' | 'refunding' | 'refunded'>('ready');
  const [videoData, setVideoData] = useState<{ videoUrl: string; metadataURI: string; promptCount?: number; attemptId?: string } | null>(null);

  // Wagmi hooks for contract interaction
  const { address } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isTxPending, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash });

  // Fetch movie data
  useEffect(() => {
    const fetchMovie = async () => {
      try {
        const response = await fetch(`/api/movies/${movieSlug}`);
        if (response.ok) {
          const movie = await response.json();
          setMovieData(movie);
        }
      } catch (err) {
        console.error('Error fetching movie:', err);
      }
    };

    if (movieSlug) {
      fetchMovie();
    }
  }, [movieSlug]);

  // Check if scene is already awaiting confirmation (user returned to page)
  useEffect(() => {
    const checkSceneStatus = async () => {
      if (!sceneId) return;

      try {
        const response = await fetch(`/api/scenes/${sceneId}/status`);
        if (response.ok) {
          const sceneData = await response.json();

          // Scene is completed - redirect to scene page
          if (sceneData.status === 'completed') {
            router.push(`/movie/${movieSlug}/scene/${sceneId}`);
          }
          // Scene is awaiting confirmation - show confirmation modal
          else if (sceneData.status === 'awaiting_confirmation' && sceneData.videoUrl && sceneData.metadataURI) {
            setVideoData({
              videoUrl: sceneData.videoUrl,
              metadataURI: sceneData.metadataURI,
              promptCount: sceneData.promptCount,
              attemptId: sceneData.attemptId
            });
            setCompletedSceneId(sceneId);
            setProgress(100);
            setStatus('Complete!');
          }
        }
      } catch (err) {
        console.error('Error checking scene status:', err);
      }
    };

    // Only check if we don't have a promptId (user came back without active generation)
    if (sceneId && !promptId) {
      checkSceneStatus();
    }
  }, [sceneId, promptId, movieSlug, router]);

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

      // Store video data for confirmation modal
      if (data.success) {
        setVideoData({
          videoUrl: data.videoUrl,
          metadataURI: data.metadataURI,
          promptCount: data.promptCount,
          attemptId: data.attemptId
        });
        setCompletedSceneId(data.sceneId);
        setProgress(100);
        setStatus('Complete!');
      }

      return data;

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

  // Handle scene confirmation (mint NFT)
  const handleConfirmScene = async () => {
    if (!videoData || !address || !sceneId) return;

    setConfirmationState('confirming');

    try {
      await writeContract({
        address: CONTRACT_ADDRESS,
        abi: VideoAdventureABI,
        functionName: 'confirmScene',
        args: [BigInt(sceneId), videoData.metadataURI]
      });
    } catch (error) {
      console.error('[Confirm] Error:', error);
      setConfirmationState('ready');
    }
  };

  // Handle refund request (50% back)
  const handleRequestRefund = async () => {
    if (!address || !sceneId) return;

    setConfirmationState('refunding');

    try {
      await writeContract({
        address: CONTRACT_ADDRESS,
        abi: VideoAdventureABI,
        functionName: 'requestRefund',
        args: [BigInt(sceneId)]
      });
    } catch (error) {
      console.error('[Refund] Error:', error);
      setConfirmationState('ready');
    }
  };

  // Verify confirmation or refund after transaction success
  useEffect(() => {
    if (isTxSuccess && hash && sceneId) {
      if (confirmationState === 'confirming') {
        (async () => {
          try {
            const response = await fetch('/api/scenes/verify-confirmation', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sceneId: parseInt(sceneId),
                transactionHash: hash,
                userAddress: address
              })
            });

            if (response.ok) {
              setConfirmationState('confirmed');
              // NOW show share prompt
              setTimeout(() => setShowSharePrompt(true), 1000);
            } else {
              const error = await response.json();
              console.error('[VerifyConfirmation] Error:', error);
              setError('Failed to verify confirmation');
            }
          } catch (err) {
            console.error('[VerifyConfirmation] Error:', err);
            setError('Failed to verify confirmation');
          }
        })();
      } else if (confirmationState === 'refunding') {
        (async () => {
          try {
            const response = await fetch('/api/scenes/verify-refund', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sceneId: parseInt(sceneId),
                attemptId: attemptId ? parseInt(attemptId) : undefined,
                transactionHash: hash,
                userAddress: address
              })
            });

            if (response.ok) {
              setConfirmationState('refunded');
            } else {
              const error = await response.json();
              console.error('[VerifyRefund] Error:', error);
              setError('Failed to verify refund');
            }
          } catch (err) {
            console.error('[VerifyRefund] Error:', err);
            setError('Failed to verify refund');
          }
        })();
      }
    }
  }, [isTxSuccess, hash, confirmationState, sceneId, attemptId, address]);

  // Handle sharing the completed scene
  const handleShare = () => {
    const sceneUrl = `${process.env.NEXT_PUBLIC_URL || window.location.origin}/movie/${movieSlug}/scene/${completedSceneId}`;
    composeCast({
      text: `Just created a new timeline in 2009! What happens when Bitcoin's story changes? 🎬✨`,
      embeds: [sceneUrl]
    });
    // Redirect to movie home after sharing
    setTimeout(() => router.push(`/movie/${movieSlug}`), 500);
  };

  const handleSkipShare = () => {
    router.push(`/movie/${movieSlug}`);
  };

  // Parse color scheme
  const colorScheme: MovieColorScheme = movieData?.color_scheme
    ? (movieData.color_scheme as unknown as MovieColorScheme)
    : DEFAULT_COLOR_SCHEME;

  // Show confirmation modal (before share prompt)
  if (videoData && confirmationState === 'ready') {
    return (
      <MovieThemeProvider colorScheme={colorScheme}>
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-black/90 border-2 border-movie-primary rounded-lg p-8 max-w-2xl w-full">
            <h2 className="text-2xl font-bold text-movie-primary mb-4">
              Your scene is ready!
            </h2>

            {/* Video preview */}
            <video
              src={videoData.videoUrl}
              controls
              className="w-full rounded-lg mb-6"
            />

            <p className="text-white mb-6">
              Review your scene and choose:
            </p>

            <div className="flex gap-4 flex-col">
              <button
                onClick={handleConfirmScene}
                disabled={isPending || isTxPending}
                className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold disabled:opacity-50 transition-colors"
              >
                {isTxPending ? 'Minting NFT...' : '✓ Confirm Scene (Mint NFT)'}
              </button>

              {videoData.promptCount && videoData.promptCount < 3 && videoData.attemptId && (
                <button
                  onClick={() => router.push(`/movie/${movieSlug}/create?attemptId=${videoData.attemptId}&sceneId=${sceneId}`)}
                  disabled={isPending || isTxPending}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-3 rounded-lg font-bold disabled:opacity-50 transition-colors"
                >
                  🔄 Try Again ({videoData.promptCount}/3 attempts used)
                </button>
              )}

              <button
                onClick={handleRequestRefund}
                disabled={isPending || isTxPending}
                className="w-full bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-bold disabled:opacity-50 transition-colors"
              >
                ✕ Request 50% Refund
              </button>
            </div>

            <p className="text-sm text-white/70 mt-4">
              <strong>Confirm:</strong> Mints your NFT and adds your scene to the story permanently.<br/>
              {videoData.promptCount && videoData.promptCount < 3 && <><strong>Try Again:</strong> Generate a new version (up to 3 total attempts).<br/></>}
              <strong>Refund:</strong> Returns 50% of your payment and reopens the slot for others.
            </p>
          </div>
        </div>
      </MovieThemeProvider>
    );
  }

  // Show confirmation success message
  if (confirmationState === 'confirmed' && !showSharePrompt) {
    return (
      <MovieThemeProvider colorScheme={colorScheme}>
        <div className="min-h-screen bg-black flex items-center justify-center p-8 md:p-4 font-source-code">
          <div className="bg-black/85 backdrop-blur-md rounded-xl border-[3px] border-white/30 p-8 max-w-[600px] w-full shadow-[0_0_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] text-center md:p-6">
            <div className="text-6xl mb-4 animate-bounce">✓</div>
            <h1 className="text-[2rem] md:text-2xl font-bold text-green-600 my-0 mb-4">NFT Minted!</h1>
            <p className="text-white/90 text-base mb-8 leading-relaxed">
              Your scene is now part of the story permanently.
            </p>
          </div>
        </div>
      </MovieThemeProvider>
    );
  }

  // Show refund success message
  if (confirmationState === 'refunded') {
    return (
      <MovieThemeProvider colorScheme={colorScheme}>
        <div className="min-h-screen bg-black flex items-center justify-center p-8 md:p-4 font-source-code">
          <div className="bg-black/85 backdrop-blur-md rounded-xl border-[3px] border-white/30 p-8 max-w-[600px] w-full shadow-[0_0_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] text-center md:p-6">
            <div className="text-6xl mb-4">✓</div>
            <h1 className="text-[2rem] md:text-2xl font-bold text-yellow-600 my-0 mb-4">Refund Processed</h1>
            <p className="text-white/90 text-base mb-8 leading-relaxed">
              50% returned to your wallet. Slot reopened for other players.
            </p>
            <button
              className="font-source-code text-lg md:text-base font-bold text-black rounded-lg py-5 px-8 md:py-4 cursor-pointer transition-all duration-200 border-none uppercase tracking-[0.05em] mx-2 md:mx-0 md:my-2 md:w-full hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                boxShadow: '0 0 20px rgba(255, 215, 0, 0.4)'
              }}
              onClick={() => router.push(`/movie/${movieSlug}`)}
            >
              Back to Movie
            </button>
          </div>
        </div>
      </MovieThemeProvider>
    );
  }

  // Show share prompt modal
  if (showSharePrompt) {
    return (
      <MovieThemeProvider colorScheme={colorScheme}>
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
      </MovieThemeProvider>
    );
  }

  if (error) {
    return (
      <MovieThemeProvider colorScheme={colorScheme}>
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
                onClick={() => router.push(`/movie/${movieSlug}/create?attemptId=${searchParams.get('attemptId')}&sceneId=${sceneId}`)}
              >
                Try Again
              </button>
            )}

            <button
              className="font-saira text-sm text-white/60 bg-transparent border-2 border-white/20 rounded-lg py-3 px-6 cursor-pointer transition-all duration-200 uppercase tracking-[0.05em] mx-2 md:mx-0 md:my-2 md:w-full hover:text-white/90 hover:border-white/40 hover:bg-white/5"
              onClick={() => router.push(`/movie/${movieSlug}`)}
            >
              Go Back
            </button>
          </div>
        </div>
      </MovieThemeProvider>
    );
  }

  return (
    <MovieThemeProvider colorScheme={colorScheme}>
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
    </MovieThemeProvider>
  );
}

export default function GeneratingPage({ params }: GeneratingPageProps) {
  const [movieSlug, setMovieSlug] = useState('');

  useEffect(() => {
    params.then(({ slug }) => {
      setMovieSlug(slug);
    });
  }, [params]);

  if (!movieSlug) {
    return (
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
    );
  }

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
      <GeneratingPageContent movieSlug={movieSlug} />
    </Suspense>
  );
}
