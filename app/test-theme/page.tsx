'use client';

import { MovieThemeProvider } from '@/app/components/MovieThemeProvider';
import { TestMovieButton } from '@/app/components/TestMovieButton';
import { PRESET_COLOR_SCHEMES } from '@/app/types/movie';
import { useState } from 'react';

/**
 * Test page for movie theming system
 *
 * Visit /test-theme to see the theming in action
 * Try switching between different movie color schemes
 */
export default function TestThemePage() {
  const [selectedScheme, setSelectedScheme] = useState<keyof typeof PRESET_COLOR_SCHEMES>('2009');

  return (
    <MovieThemeProvider colorScheme={PRESET_COLOR_SCHEMES[selectedScheme]}>
      <div className="min-h-screen bg-movie-bg flex flex-col items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          <h1 className="text-movie-primary font-saira text-4xl font-bold text-center mb-8 uppercase">
            Movie Theme Test
          </h1>

          {/* Theme Selector */}
          <div className="mb-8">
            <label className="text-movie-text font-saira text-sm block mb-2">
              Select Movie Theme:
            </label>
            <select
              value={selectedScheme}
              onChange={(e) => setSelectedScheme(e.target.value as keyof typeof PRESET_COLOR_SCHEMES)}
              className="w-full bg-movie-bg-overlay border-2 border-movie-primary text-movie-text
                         font-saira rounded-lg px-4 py-2 cursor-pointer"
            >
              {Object.keys(PRESET_COLOR_SCHEMES).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>

          {/* Test Components */}
          <TestMovieButton />

          {/* Color Palette Display */}
          <div className="mt-8 bg-movie-bg-overlay backdrop-blur-md border-2 border-white/30 rounded-xl p-6">
            <h3 className="text-movie-text font-saira text-lg font-bold mb-4">
              Current Color Scheme
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(PRESET_COLOR_SCHEMES[selectedScheme]).map(([key, value]) => (
                <div key={key} className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded border-2 border-white/30"
                    style={{ background: value }}
                  />
                  <div>
                    <p className="text-movie-text font-saira text-xs font-bold">
                      {key}
                    </p>
                    <p className="text-movie-text-muted font-saira text-xs">
                      {value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </MovieThemeProvider>
  );
}
