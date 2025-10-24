'use client';

import { useGeneration } from '@/app/contexts/GenerationContext';
import { useEffect, useState } from 'react';

export default function GenerationNotificationBar() {
  const { activeGeneration, isGenerating } = useGeneration();
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Update time remaining every second
  useEffect(() => {
    if (!activeGeneration) {
      return;
    }

    const updateTimeRemaining = () => {
      const expiresAt = new Date(activeGeneration.expiresAt).getTime();
      const now = Date.now();
      const remaining = Math.max(0, expiresAt - now);

      if (remaining === 0) {
        setTimeRemaining('Expired');
        return;
      }

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      if (minutes > 0) {
        setTimeRemaining(`${minutes}m ${seconds}s remaining`);
      } else {
        setTimeRemaining(`${seconds}s remaining`);
      }
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [activeGeneration]);

  if (!isGenerating || !activeGeneration) {
    return null;
  }

  const getStatusText = () => {
    if (activeGeneration.status === 'queued') {
      return 'In queue...';
    } else if (activeGeneration.status === 'in_progress') {
      return 'Generating video...';
    } else if (activeGeneration.status === 'completed') {
      return 'Complete!';
    }
    return '';
  };

  const isCompleted = activeGeneration.status === 'completed';

  return (
    <div className="fixed top-0 left-0 right-0 z-[2000] bg-black/95 backdrop-blur-md border-b border-white/10 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 ${isCompleted ? 'bg-emerald-400' : 'bg-green-400'} rounded-full ${isCompleted ? '' : 'animate-pulse'}`} />
            <p className="text-white font-saira text-sm">
              {isCompleted
                ? `Scene created in "${activeGeneration.movieTitle}"!`
                : `Creating scene in "${activeGeneration.movieTitle}"...`
              }
            </p>
          </div>
          <p className="text-white/60 font-saira text-xs">
            {getStatusText()}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
            style={{ width: `${activeGeneration.progress}%` }}
          />
        </div>

        {/* Time remaining - hide when completed */}
        {!isCompleted && (
          <p className="text-white/40 font-saira text-xs mt-2 text-right">
            {timeRemaining}
          </p>
        )}
      </div>
    </div>
  );
}
