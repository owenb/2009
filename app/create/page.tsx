"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./create.module.css";

function CreatePageContent() {
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

      // Redirect to generation progress page
      router.push(`/generating?promptId=${data.promptId}&sceneId=${sceneId}`);

    } catch (err) {
      console.error('Error:', err);
      setError((err as Error).message);
      setIsSubmitting(false);
    }
  };

  if (!attemptId || !sceneId) {
    return (
      <div className={styles.container}>
        <div className={styles.modal}>
          <div className={styles.errorBox}>
            <p className={styles.errorText}>Missing session data</p>
            <button onClick={() => router.push('/')} className={styles.button}>
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.modal}>
        {/* Header with timer */}
        <div className={styles.header}>
          <h1 className={styles.title}>What happens next?</h1>
          {timeRemaining && (
            <div className={styles.timer}>
              {timeRemaining}
            </div>
          )}
        </div>

        {/* Context display */}
        {!isLoadingContext && (
          <div className={styles.context}>
            <span className={styles.contextLabel}>Continuing from:</span>
            <span className={styles.contextValue}>{parentSceneLabel}</span>
          </div>
        )}

        {/* Prompt Input */}
        <textarea
          className={styles.textarea}
          placeholder="Describe what happens next in 2009..."
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          rows={4}
          disabled={isSubmitting}
          autoFocus
        />

        {/* Error Message */}
        {error && (
          <div className={styles.error}>
            {error}
          </div>
        )}

        {/* Generate Button */}
        <button
          className={styles.generateButton}
          onClick={handleSubmit}
          disabled={isSubmitting || !promptText.trim()}
        >
          {isSubmitting ? 'Generating...' : 'Generate'}
        </button>
      </div>
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={
      <div className={styles.container}>
        <div className={styles.card}>
          <p>Loading...</p>
        </div>
      </div>
    }>
      <CreatePageContent />
    </Suspense>
  );
}
