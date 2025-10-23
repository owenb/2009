'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAccount } from 'wagmi';

interface ActiveGeneration {
  attemptId: number;
  sceneId: number;
  movieSlug: string;
  movieTitle: string;
  status: 'queued' | 'in_progress' | 'completed';
  progress: number; // 0-100
  expiresAt: string;
  promptId: number;
}

interface GenerationContextValue {
  activeGeneration: ActiveGeneration | null;
  isGenerating: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const GenerationContext = createContext<GenerationContextValue | undefined>(undefined);

export function GenerationProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount();
  const [activeGeneration, setActiveGeneration] = useState<ActiveGeneration | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveGeneration = useCallback(async () => {
    if (!address) {
      setActiveGeneration(null);
      return;
    }

    try {
      const response = await fetch(`/api/user/active-generation?address=${address}`);

      if (!response.ok) {
        throw new Error('Failed to fetch active generation');
      }

      const data = await response.json();

      if (data.hasActiveGeneration && data.generation) {
        setActiveGeneration(data.generation);
        setError(null);
      } else {
        setActiveGeneration(null);
      }
    } catch (err) {
      console.error('Error fetching active generation:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [address]);

  // Initial fetch when address changes
  useEffect(() => {
    if (address) {
      setIsLoading(true);
      fetchActiveGeneration().finally(() => setIsLoading(false));
    } else {
      setActiveGeneration(null);
    }
  }, [address, fetchActiveGeneration]);

  // Poll every 5 seconds when there's an active generation
  useEffect(() => {
    if (!address || !activeGeneration) {
      return;
    }

    const interval = setInterval(() => {
      fetchActiveGeneration();
    }, 5000); // 5 seconds

    return () => clearInterval(interval);
  }, [address, activeGeneration, fetchActiveGeneration]);

  // Handle completion (auto-dismiss after 3 seconds)
  useEffect(() => {
    if (activeGeneration?.status === 'completed') {
      const timeout = setTimeout(() => {
        setActiveGeneration(null);
      }, 3000);

      return () => clearTimeout(timeout);
    }
  }, [activeGeneration?.status]);

  const value: GenerationContextValue = {
    activeGeneration,
    isGenerating: activeGeneration !== null,
    isLoading,
    error,
    refetch: fetchActiveGeneration,
  };

  return (
    <GenerationContext.Provider value={value}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  const context = useContext(GenerationContext);
  if (context === undefined) {
    throw new Error('useGeneration must be used within a GenerationProvider');
  }
  return context;
}
