import { useState, useEffect } from "react";
import type { SceneNode } from "@/app/components/StoryMap";

interface UseStoryMapDataOptions {
  movieId: number;
  viewerAddress?: string | null;
}

/**
 * Hook to fetch scene tree data
 */
export function useStoryMapData({ movieId, viewerAddress }: UseStoryMapDataOptions) {
  const [tree, setTree] = useState<SceneNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchTree = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const url = viewerAddress
          ? `/api/scenes/tree?movieId=${movieId}&viewerAddress=${encodeURIComponent(viewerAddress)}`
          : `/api/scenes/tree?movieId=${movieId}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch scene tree');

        const data = await response.json();
        setTree(data.tree);
      } catch (err) {
        console.error('Error fetching scene tree:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchTree();
  }, [movieId, viewerAddress]);

  return { tree, isLoading, error };
}
