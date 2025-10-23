"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MovieThemeProvider } from "@/app/components/MovieThemeProvider";
import { MovieColorScheme, DEFAULT_COLOR_SCHEME } from "@/app/types/movie";
import type { Movie } from "@/lib/db/types";

interface CreatePageProps {
  params: Promise<{
    slug: string;
  }>;
}

function CreatePageContent({ movieSlug }: { movieSlug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const attemptId = searchParams.get('attemptId');
  const sceneId = searchParams.get('sceneId');

  const [promptText, setPromptText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [parentSceneLabel, setParentSceneLabel] = useState<string>('');
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [movieData, setMovieData] = useState<Movie | null>(null);

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

  // Update countdown timer
  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = expiresAt.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining('EXPIRED');
        clearInterval(interval);
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  // Fetch parent scene context on mount
  useEffect(() => {
    if (!attemptId || !sceneId) {
      setError('No attempt ID provided. Please start over.');
      return;
    }

    const fetchContext = async () => {
      try {
        setIsLoadingContext(true);

        // Fetch the scene to get parent info
        const sceneResponse = await fetch(`/api/scenes/${sceneId}/context`);
        if (sceneResponse.ok) {
          const sceneData = await sceneResponse.json();
          setParentSceneLabel(sceneData.parentLabel || 'the beginning');
          setExpiresAt(new Date(sceneData.expiresAt));
        } else {
          // Fallback
          setParentSceneLabel('the story');
          setExpiresAt(new Date(Date.now() + 3600000));
        }
      } catch (err) {
        console.error('Error fetching context:', err);
        setParentSceneLabel('the story');
        setExpiresAt(new Date(Date.now() + 3600000));
      } finally {
        setIsLoadingContext(false);
      }
    };

    fetchContext();
  }, [attemptId, sceneId]);

  const handleSubmit = async () => {
    if (!promptText.trim()) {
      setError('Please describe what happens next');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // First, automatically align with story
      const refineResponse = await fetch('/api/prompts/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: parseInt(attemptId!),
          promptText
        })
      });

      if (!refineResponse.ok) {
        const errorData = await refineResponse.json();
        throw new Error(errorData.error || 'Failed to process your idea');
      }

      const refineData = await refineResponse.json();
      const finalRefinedPrompt = refineData.refinedPrompt;

      // Submit the aligned prompt
      const response = await fetch('/api/prompts/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: parseInt(attemptId!),
          promptText,
          refinedPromptText: finalRefinedPrompt
        })
      });

      if (!response.ok) {
        const errorData = await response.json();

        if (errorData.errorType === 'moderation_rejected') {
          setError('Content policy violation. Try a different idea.');
          setIsSubmitting(false);
          return;
        } else if (errorData.errorType === 'rate_limited') {
          setError('Too many requests. Wait a moment.');
          setIsSubmitting(false);
          return;
        }

        throw new Error(errorData.error || 'Failed to submit');
      }

      const data = await response.json();

      // Redirect to generation progress page (movie-specific)
      router.push(`/movie/${movieSlug}/generating?promptId=${data.promptId}&sceneId=${sceneId}`);

    } catch (err) {
      console.error('Error:', err);
      setError((err as Error).message);
      setIsSubmitting(false);
    }
  };

  // Parse color scheme
  const colorScheme: MovieColorScheme = movieData?.color_scheme
    ? (movieData.color_scheme as unknown as MovieColorScheme)
    : DEFAULT_COLOR_SCHEME;

  if (!attemptId || !sceneId) {
    return (
      <MovieThemeProvider colorScheme={colorScheme}>
        <div className="w-screen h-screen bg-black flex items-center justify-center p-8 font-source-code">
          <div className="w-full max-w-[600px] bg-black/85 border-[3px] border-white/30 rounded-xl p-8 backdrop-blur-md shadow-[0_0_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] flex flex-col gap-6">
            <div className="flex flex-col items-center gap-4 p-8">
              <p className="font-source-code text-lg text-[#FF6B6B] m-0">Missing session data</p>
              <button onClick={() => router.push(`/movie/${movieSlug}`)} className="font-source-code text-sm text-white/60 bg-transparent border-2 border-white/20 rounded-lg px-6 py-3 cursor-pointer transition-all duration-200 uppercase tracking-[0.05em] hover:text-white/90 hover:border-white/40 hover:bg-white/5">
                Go Back
              </button>
            </div>
          </div>
        </div>
      </MovieThemeProvider>
    );
  }

  return (
    <MovieThemeProvider colorScheme={colorScheme}>
      <div className="w-screen h-screen bg-black flex items-center justify-center p-8 md:p-6 sm:p-0 font-source-code">
        <div className="w-full max-w-[600px] bg-black/85 border-[3px] border-white/30 rounded-xl p-8 md:p-6 sm:p-5 sm:rounded-2xl backdrop-blur-md shadow-[0_0_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] flex flex-col gap-6">
          {/* Header with timer */}
          <div className="flex justify-between items-center gap-4 sm:flex-col sm:items-start sm:gap-3">
            <h1 className="font-source-code text-[2rem] md:text-2xl sm:text-xl font-bold text-white m-0 uppercase tracking-[0.1em]" style={{textShadow: '0 0 20px rgba(255, 255, 255, 0.5)'}}>What happens next?</h1>
            {timeRemaining && (
              <div className="font-source-code text-xl md:text-base font-bold text-[#FFD700] bg-[#FFD700]/10 border-2 border-[#FFD700]/30 rounded-lg py-2 px-4 min-w-[80px] md:min-w-[70px] md:py-[0.4rem] md:px-3 text-center sm:self-stretch">
                {timeRemaining}
              </div>
            )}
          </div>

          {/* Context display */}
          {!isLoadingContext && (
            <div className="bg-white/5 border-2 border-white/20 rounded-lg p-4 text-white font-source-code text-base font-semibold md:flex-col md:items-start md:gap-2">
              <span className="text-white/60">Continuing from: </span>
              <span>{parentSceneLabel}</span>
            </div>
          )}

          {/* Prompt Input */}
          <textarea
            className="font-source-code text-base text-white bg-white/5 border-2 border-white/20 rounded-lg py-4 px-5 resize-y min-h-[120px] transition-all duration-200 md:text-[0.95rem] focus:outline-none focus:border-[#FFD700]/50 focus:bg-white/8 focus:shadow-[0_0_20px_rgba(255,215,0,0.2)] placeholder:text-white/40 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Describe what happens next in 2009..."
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={4}
            disabled={isSubmitting}
            autoFocus
          />

          {/* Error Message */}
          {error && (
            <div className="font-source-code text-sm text-[#FF6B6B] bg-[#FF6B6B]/10 border-2 border-[#FF6B6B]/30 rounded-lg py-3 px-4 text-center">
              {error}
            </div>
          )}

          {/* Generate Button */}
          <button
            className="font-source-code text-lg font-bold text-black rounded-lg py-5 px-8 cursor-pointer transition-all duration-200 border-none uppercase tracking-[0.05em] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none hover:not(:disabled):-translate-y-0.5 active:not(:disabled):translate-y-0"
            style={{
              background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
              boxShadow: '0 0 20px rgba(255, 215, 0, 0.4)',
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting && promptText.trim()) {
                e.currentTarget.style.boxShadow = '0 0 30px rgba(255, 215, 0, 0.6)';
                e.currentTarget.style.background = 'linear-gradient(135deg, #FFE44D 0%, #FFB84D 100%)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.4)';
              e.currentTarget.style.background = 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)';
            }}
            onClick={handleSubmit}
            disabled={isSubmitting || !promptText.trim()}
          >
            {isSubmitting ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </MovieThemeProvider>
  );
}

export default function CreatePage({ params }: CreatePageProps) {
  const [movieSlug, setMovieSlug] = useState('');

  useEffect(() => {
    params.then(({ slug }) => {
      setMovieSlug(slug);
    });
  }, [params]);

  if (!movieSlug) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center p-8 font-source-code">
        <div className="bg-black/85 backdrop-blur-md rounded-xl border-[3px] border-white/30 p-8 max-w-[600px] w-full shadow-[0_0_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] text-center">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="w-screen h-screen bg-black flex items-center justify-center p-8 font-source-code">
        <div className="bg-black/85 backdrop-blur-md rounded-xl border-[3px] border-white/30 p-8 max-w-[600px] w-full shadow-[0_0_40px_rgba(255,255,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] text-center">
          <p>Loading...</p>
        </div>
      </div>
    }>
      <CreatePageContent movieSlug={movieSlug} />
    </Suspense>
  );
}
