'use client';

/**
 * TestMovieButton
 *
 * A simple test component to demonstrate Tailwind + Movie Theming working together.
 * This component uses the movie-* color utilities defined in app/globals.css (@theme block).
 *
 * Usage:
 * ```tsx
 * <MovieThemeProvider colorScheme={movie.colorScheme}>
 *   <TestMovieButton />
 * </MovieThemeProvider>
 * ```
 */
export function TestMovieButton() {
  return (
    <div className="flex flex-col gap-4 p-8">
      {/* Primary button - uses movie-primary color */}
      <button
        className="bg-movie-primary text-black font-source-code font-bold uppercase tracking-wide
                   rounded-lg px-8 py-4 transition-all duration-200
                   hover:scale-105 hover:shadow-[0_0_30px_var(--movie-primary)]
                   active:scale-95"
      >
        Extend Story
      </button>

      {/* Secondary button - uses movie-secondary */}
      <button
        className="bg-movie-secondary text-white font-source-code font-semibold
                   rounded-lg px-6 py-3 transition-all duration-200
                   hover:bg-movie-accent"
      >
        View Scene
      </button>

      {/* Glassmorphism card using movie colors */}
      <div
        className="bg-movie-bg-overlay backdrop-blur-md border-2 border-white/30
                   rounded-xl p-6 shadow-[0_0_40px_rgba(255,255,255,0.1)]"
      >
        <h3 className="text-movie-text font-source-code text-2xl font-bold mb-3
                       uppercase tracking-wider text-shadow-[0_0_20px_rgba(255,255,255,0.5)]">
          What Happens Next?
        </h3>
        <p className="text-movie-text-muted font-source-code text-sm leading-relaxed">
          This is a test of the movie theming system. The colors you see are coming from
          CSS variables that are injected by the MovieThemeProvider.
        </p>
      </div>

      {/* Accent border example */}
      <div className="border-2 border-movie-accent rounded-lg p-4">
        <p className="text-movie-text font-source-code text-sm">
          🎨 This border uses the movie&apos;s accent color
        </p>
      </div>
    </div>
  );
}
