'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Movie } from '@/lib/db/types';

export default function FeaturedMoviesSection() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchFeaturedMovies() {
      try {
        const response = await fetch('/api/movies?featured=true&limit=3', {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch featured movies');
        }

        const data = await response.json();
        setMovies(data.movies || []);
        setError(null);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        console.error('Error fetching featured movies:', err);
        setError(err instanceof Error ? err.message : 'Failed to load featured movies');
      } finally {
        setIsLoading(false);
      }
    }

    fetchFeaturedMovies();

    return () => {
      abortController.abort();
    };
  }, []);

  if (isLoading) {
    return (
      <section className="px-8 py-12 max-w-6xl mx-auto">
        <h2 className="font-saira text-3xl font-bold text-white mb-8">Featured Movies</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="aspect-video bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (error || movies.length === 0) {
    return null; // Don't show section if no featured movies
  }

  return (
    <section className="px-8 py-12 max-w-6xl mx-auto">
      <h2 className="font-saira text-3xl font-bold text-white mb-8">Featured Movies</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {movies.map((movie) => (
          <Link
            key={movie.id}
            href={`/movie/${movie.slug}`}
            className="relative rounded-xl overflow-hidden group cursor-pointer hover:scale-105 transition-transform duration-300 block"
          >
            {/* Cover image or placeholder */}
            <div className="aspect-video relative bg-gradient-to-br from-white/10 to-white/5">
              {movie.cover_image_url ? (
                <img
                  src={movie.cover_image_url}
                  alt={`${movie.title} cover`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="font-saira text-6xl text-white/20" aria-hidden="true">
                    {movie.title.charAt(0)}
                  </span>
                </div>
              )}

              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
            </div>

            {/* Content overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <h3 className="font-saira text-2xl font-bold text-white mb-2">
                {movie.title}
              </h3>
              {movie.description && (
                <p className="text-white/80 text-sm mb-4 line-clamp-2">
                  {movie.description}
                </p>
              )}
              <div className="flex gap-4 text-xs text-white/60">
                <span>{movie.total_scenes} scenes</span>
                <span>{movie.total_views} views</span>
                {movie.genre && <span>{movie.genre}</span>}
              </div>
            </div>

            {/* Hover effect */}
            <div className="absolute inset-0 border-2 border-white/0 group-hover:border-white/20 rounded-xl transition-all duration-300 pointer-events-none" />
          </Link>
        ))}
      </div>
    </section>
  );
}
