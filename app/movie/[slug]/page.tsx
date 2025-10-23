import { notFound } from 'next/navigation';
import { getMovieBySlug } from '@/lib/db/movies';
import { MovieThemeProvider } from '@/app/components/MovieThemeProvider';
import { MovieColorScheme, DEFAULT_COLOR_SCHEME } from '@/app/types/movie';
import WatchMovie from '@/app/components/WatchMovie';

interface MoviePageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function MoviePage({ params }: MoviePageProps) {
  const { slug } = await params;

  // Fetch movie by slug
  const movie = await getMovieBySlug(slug);

  // Return 404 if movie not found
  if (!movie) {
    notFound();
  }

  // Check if movie is active (you may want to show different UI for draft/paused/archived)
  if (movie.status !== 'active') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white font-source-code">
        <div className="text-center">
          <h1 className="text-2xl mb-4">Movie Not Available</h1>
          <p className="text-white/70">
            This movie is currently {movie.status}. Check back later!
          </p>
        </div>
      </div>
    );
  }

  // Ensure movie has a genesis scene (check for null/undefined, not falsy since ID can be 0)
  if (movie.genesis_scene_id === null || movie.genesis_scene_id === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white font-source-code">
        <div className="text-center">
          <h1 className="text-2xl mb-4">Movie Not Ready</h1>
          <p className="text-white/70">
            This movie doesn't have a starting scene yet. Check back soon!
          </p>
        </div>
      </div>
    );
  }

  // Parse color scheme from database JSONB
  const colorScheme: MovieColorScheme = movie.color_scheme
    ? (movie.color_scheme as unknown as MovieColorScheme)
    : DEFAULT_COLOR_SCHEME;

  return (
    <MovieThemeProvider colorScheme={colorScheme}>
      <WatchMovie
        movieId={movie.id}
        movieSlug={movie.slug}
        genesisSceneId={movie.genesis_scene_id}
      />
    </MovieThemeProvider>
  );
}
