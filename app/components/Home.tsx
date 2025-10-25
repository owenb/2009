'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { Movie } from '@/lib/db/types';
import Logo from './Logo';
import { useComposeCast } from '@coinbase/onchainkit/minikit';

type SortOption = 'created_at' | 'total_scenes' | 'total_views' | 'title';

const LIMIT = 12;

// Map of movie slugs to local thumbnail paths
const LOCAL_THUMBNAILS: Record<string, string> = {
  'mochi': '/mochi-thumbnail.jpg',
};

function getMovieThumbnail(movie: Movie): string | null {
  // Check for local thumbnail first
  if (movie.slug && LOCAL_THUMBNAILS[movie.slug]) {
    return LOCAL_THUMBNAILS[movie.slug];
  }
  // Fall back to database cover image
  return movie.cover_image_url || null;
}

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters and sorting
  const [genre, _setGenre] = useState<string>('');
  const [search, _setSearch] = useState<string>('');
  const [sortBy, _setSortBy] = useState<SortOption>('total_views');
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  // Compose cast hook for social sharing
  const { composeCastAsync } = useComposeCast();

  // Fetch movies with proper cleanup
  useEffect(() => {
    const abortController = new AbortController();

    async function fetchMovies() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          status: 'active',
          sortBy,
          sortOrder: 'desc',
          limit: LIMIT.toString(),
          offset: offset.toString(),
        });

        if (genre) {
          params.append('genre', genre);
        }
        if (search) {
          params.append('search', search);
        }

        const response = await fetch(`/api/movies?${params.toString()}`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch movies');
        }

        const data = await response.json();

        // Use functional update to avoid stale closure
        setMovies((prevMovies) =>
          offset === 0 ? data.movies : [...prevMovies, ...data.movies]
        );
        setHasMore(data.hasMore || false);
        setError(null);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        console.error('Error fetching movies:', err);
        setError(err instanceof Error ? err.message : 'Failed to load movies');
      } finally {
        setIsLoading(false);
      }
    }

    fetchMovies();

    return () => {
      abortController.abort();
    };
  }, [genre, search, sortBy, offset]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [genre, search, sortBy]);

  const loadMore = useCallback(() => {
    setOffset((prev) => prev + LIMIT);
  }, []);

  const handleAddYourOwnMovie = async () => {
    try {
      const text = `I want my own movie within BasedOn! Let's talk.`;

      const result = await composeCastAsync({
        text: text,
        embeds: ['https://2009-five.vercel.app']
      });

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
    <section className="px-4 py-8 bg-black min-h-screen">
      {/* Logo */}
      <div className="flex justify-center mb-12">
        <Logo />
      </div>

      {isLoading && offset === 0 ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-video bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-white/60">
            {error}
          </p>
        </div>
      ) : movies.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-white/60">
            No movies found
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {movies.map((movie) => (
              <Link
                key={movie.id}
                href={`/movie/${movie.slug}`}
                className="bg-white/5 rounded-lg overflow-hidden hover:bg-white/10 transition-colors cursor-pointer group block"
              >
                {/* Cover image */}
                <div className="aspect-video relative bg-gradient-to-br from-white/10 to-white/5">
                  {getMovieThumbnail(movie) ? (
                    <img
                      src={getMovieThumbnail(movie)!}
                      alt={`${movie.title} cover`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="font-saira text-4xl text-white/20" aria-hidden="true">
                        {movie.title.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-saira text-lg font-bold text-white mb-1 group-hover:text-white/80 transition-colors">
                    {movie.title}
                  </h3>
                  {movie.description && (
                    <p className="text-white/60 text-sm mb-3 line-clamp-2">
                      {movie.description}
                    </p>
                  )}
                  <div className="flex justify-between text-xs text-white/40">
                    <span>{movie.total_scenes} scenes</span>
                    {movie.genre && <span>{movie.genre}</span>}
                  </div>
                </div>
              </Link>
            ))}

            {/* Add your own movie card */}
            <div
              onClick={handleAddYourOwnMovie}
              className="bg-white/5 rounded-lg overflow-hidden hover:bg-white/10 transition-colors cursor-pointer group border-2 border-white/10 border-dashed"
            >
              {/* Question mark cover */}
              <div className="aspect-video relative bg-gradient-to-br from-purple-500/10 to-blue-500/10 flex items-center justify-center">
                <div className="text-9xl font-bold text-white/30 group-hover:text-white/50 transition-colors font-saira">
                  ?
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-saira text-lg font-bold text-white mb-2 group-hover:text-white/80 transition-colors">
                  Add Your Own Movie
                </h3>
                <p className="text-white/70 text-sm mb-3 leading-relaxed">
                  Create your own interactive adventure. We&apos;ll help you bring your vision to life with custom art style and the first 4 scenes.
                  <span className="text-white/90 font-semibold"> You keep all the platform revenue</span> generated from your movie&apos;s scenes.
                </p>
                <div className="flex justify-between text-xs text-purple-400/60">
                  <span>Launch your universe</span>
                  <span>Earn from every scene →</span>
                </div>
              </div>
            </div>
          </div>

          {hasMore && (
            <div className="text-center mt-8">
              <button
                onClick={loadMore}
                disabled={isLoading}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
