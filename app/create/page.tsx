"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./create.module.css";

export default function CreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const attemptId = searchParams.get('attemptId');
  const sceneId = searchParams.get('sceneId');

  const [promptText, setPromptText] = useState('');
  const [refinedPromptText, setRefinedPromptText] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isRefining, setIsRefining] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [showRefined, setShowRefined] = useState(false);

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

  // Validate attemptId on mount
  useEffect(() => {
    if (!attemptId) {
      setError('No attempt ID provided. Please start over.');
      return;
    }

    // TODO: Fetch attempt details to get expiration time
    // For now, set to 1 hour from now
    setExpiresAt(new Date(Date.now() + 3600000));
  }, [attemptId]);

  const handleRefine = async () => {
    if (!promptText.trim()) {
      setError('Please enter a prompt first');
      return;
    }

    setIsRefining(true);
    setError(null);

    try {
      const response = await fetch('/api/prompts/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: parseInt(attemptId!),
          promptText
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to refine prompt');
      }

      const data = await response.json();
      setRefinedPromptText(data.refinedPrompt);
      setSuggestions(data.suggestions || []);
      setShowRefined(true);

    } catch (err) {
      console.error('Error refining prompt:', err);
      setError((err as Error).message);
    } finally {
      setIsRefining(false);
    }
  };

  const handleSubmit = async () => {
    const finalPrompt = showRefined && refinedPromptText ? refinedPromptText : promptText;

    if (!finalPrompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/prompts/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: parseInt(attemptId!),
          promptText,
          refinedPromptText: showRefined ? refinedPromptText : undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json();

        // Handle specific error types
        if (errorData.errorType === 'moderation_rejected') {
          setError('Content policy violation. Please modify your prompt and try again.');
          setIsSubmitting(false);
          return;
        } else if (errorData.errorType === 'rate_limited') {
          setError('Rate limit exceeded. Please wait a moment and try again.');
          setIsSubmitting(false);
          return;
        }

        throw new Error(errorData.error || 'Failed to submit prompt');
      }

      const data = await response.json();
      console.log('Prompt submitted:', data);

      // Redirect to generation progress page
      router.push(`/generating?promptId=${data.promptId}&sceneId=${sceneId}`);

    } catch (err) {
      console.error('Error submitting prompt:', err);
      setError((err as Error).message);
      setIsSubmitting(false);
    }
  };

  if (!attemptId) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h1>Error</h1>
          <p>No attempt ID provided. Please return to the home page and try again.</p>
          <button onClick={() => router.push('/')} className={styles.button}>
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Create Your 2009 Scene</h1>
          {timeRemaining && (
            <div className={styles.timer}>
              <span className={styles.timerLabel}>Time remaining:</span>
              <span className={styles.timerValue}>{timeRemaining}</span>
            </div>
          )}
        </div>

        <div className={styles.content}>
          <div className={styles.instructions}>
            <p>Describe what happens next in this 2009 story. Be creative!</p>
            <p className={styles.hint}>
              Tip: Mention specific 2009 details like flip phones, early laptops, or the Bitcoin launch
            </p>
          </div>

          {/* Prompt Input */}
          <div className={styles.inputSection}>
            <label className={styles.label}>Your Prompt</label>
            <textarea
              className={styles.textarea}
              placeholder="Example: A person checks their flip phone and sees a text message about Bitcoin..."
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={4}
              disabled={isSubmitting}
            />
          </div>

          {/* Refine Button */}
          {!showRefined && (
            <button
              className={styles.button}
              onClick={handleRefine}
              disabled={isRefining || !promptText.trim() || isSubmitting}
            >
              {isRefining ? 'Refining with AI...' : 'Refine with AI'}
            </button>
          )}

          {/* Refined Prompt */}
          {showRefined && refinedPromptText && (
            <div className={styles.refinedSection}>
              <div className={styles.refinedHeader}>
                <label className={styles.label}>AI-Refined Prompt</label>
                <button
                  className={styles.linkButton}
                  onClick={() => setShowRefined(false)}
                >
                  Edit original
                </button>
              </div>
              <div className={styles.refinedBox}>
                {refinedPromptText}
              </div>

              {suggestions.length > 0 && (
                <div className={styles.suggestions}>
                  <p className={styles.suggestionsTitle}>Improvements:</p>
                  <ul className={styles.suggestionsList}>
                    {suggestions.map((suggestion, i) => (
                      <li key={i}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.refinedActions}>
                <button
                  className={styles.secondaryButton}
                  onClick={handleRefine}
                  disabled={isRefining || isSubmitting}
                >
                  {isRefining ? 'Refining...' : 'Refine Again'}
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            className={styles.submitButton}
            onClick={handleSubmit}
            disabled={isSubmitting || !promptText.trim()}
          >
            {isSubmitting ? 'Submitting...' : 'Generate Video'}
          </button>

          <p className={styles.note}>
            Note: Video generation takes 2-4 minutes. You can retry if moderation rejects your prompt.
          </p>
        </div>
      </div>
    </div>
  );
}
