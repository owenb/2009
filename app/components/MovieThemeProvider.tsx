'use client';

import { ReactNode } from 'react';
import { MovieColorScheme, colorSchemeToCSS, DEFAULT_COLOR_SCHEME } from '@/app/types/movie';

interface MovieThemeProviderProps {
  children: ReactNode;
  colorScheme?: MovieColorScheme;
}

/**
 * MovieThemeProvider
 *
 * Wraps movie-specific content and injects CSS variables for Tailwind theming.
 * Each movie can have its own color scheme that's applied via CSS custom properties.
 *
 * Usage:
 * ```tsx
 * <MovieThemeProvider colorScheme={movie.colorScheme}>
 *   <YourMovieComponents />
 * </MovieThemeProvider>
 * ```
 *
 * Then use Tailwind classes like:
 * - `bg-movie-primary` → Uses --movie-primary CSS variable
 * - `text-movie-text` → Uses --movie-text CSS variable
 * - `border-movie-accent` → Uses --movie-accent CSS variable
 */
export function MovieThemeProvider({
  children,
  colorScheme = DEFAULT_COLOR_SCHEME
}: MovieThemeProviderProps) {
  return (
    <div
      className="min-h-screen w-full"
      style={colorSchemeToCSS(colorScheme)}
    >
      {children}
    </div>
  );
}
