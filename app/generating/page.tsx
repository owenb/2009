"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useComposeCast } from "@coinbase/onchainkit/minikit";
import styles from "./generating.module.css";

function GeneratingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { composeCast } = useComposeCast();

  const promptId = searchParams.get('promptId');
  const sceneId = searchParams.get('sceneId');

  const [status, setStatus] = useState<string>('queued');
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  const [completedSceneId, setCompletedSceneId] = useState<string | null>(null);

  // Complete generation function
  const completeGeneration = useCallback(async (promptIdParam: string, videoJobId: string) => {
    try {
      setProgress(95);
      setStatus('Finalizing...');

      const response = await fetch('/api/generation/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptId: parseInt(promptIdParam),
          videoJobId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete generation');
      }

      const data = await response.json();
      console.log('Generation completed:', data);

      setProgress(100);
      setStatus('Complete!');
      setCompletedSceneId(data.sceneId);

      // Show share prompt after a brief moment
      setTimeout(() => {
        setShowSharePrompt(true);
      }, 1000);

    } catch (err) {
      console.error('Error completing generation:', err);
      setError((err as Error).message);
    }
  }, [router]);

  // Poll for status every 5 seconds
  useEffect(() => {
    if (!promptId) {
      setError('No prompt ID provided');
      return;
    }

    let isMounted = true;
    let pollCount = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/generation/poll?promptId=${promptId}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to poll status');
        }

        const data = await response.json();

        if (!isMounted) return;

        console.log('Poll response:', data);

        setStatus(data.status);
        pollCount++;

        // Update progress bar (fake progress for UX)
        if (data.status === 'queued') {
          setProgress(Math.min(10 + pollCount * 2, 20));
        } else if (data.status === 'in_progress') {
          setProgress(Math.min(20 + pollCount * 3, 80));
        } else if (data.status === 'completed') {
          setProgress(90);

          // Video is ready! Call complete endpoint to download and upload to R2
          await completeGeneration(promptId, data.videoJobId);
        } else if (data.status === 'failed') {
          setError(data.error || 'Video generation failed');
          setCanRetry(data.canRetry || false);
        }

      } catch (err) {
        console.error('Error polling:', err);
        if (isMounted) {
          setError((err as Error).message);
        }
      }
    };

    // Initial poll
    poll();

    // Poll every 5 seconds
    const interval = setInterval(poll, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [promptId, completeGeneration]);

  // Handle sharing the completed scene
  const handleShare = () => {
    const sceneUrl = `${process.env.NEXT_PUBLIC_URL || window.location.origin}/scene/${completedSceneId}`;
    composeCast({
      text: `Just created a new timeline in 2009! What happens when Bitcoin's story changes? 🎬✨`,
      embeds: [sceneUrl]
    });
    // Redirect to home after sharing
    setTimeout(() => router.push('/'), 500);
  };

  const handleSkipShare = () => {
    router.push('/');
  };

  // Show share prompt modal
  if (showSharePrompt) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.successIcon}>🎉</div>
          <h1 className={styles.title}>Scene Created!</h1>
          <p className={styles.status} style={{ marginBottom: '1.5rem' }}>
            Your scene is ready to share with the world
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className={styles.button}
              onClick={handleShare}
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none'
              }}
            >
              Share Your Creation
            </button>
            <button
              className={styles.secondaryButton}
              onClick={handleSkipShare}
            >
              Skip for Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.errorIcon}>⚠️</div>
          <h1 className={styles.errorTitle}>Generation Failed</h1>
          <p className={styles.errorMessage}>{error}</p>

          {canRetry && (
            <button
              className={styles.button}
              onClick={() => router.push(`/create?attemptId=${searchParams.get('attemptId')}&sceneId=${sceneId}`)}
            >
              Try Again
            </button>
          )}

          <button
            className={styles.secondaryButton}
            onClick={() => router.push('/')}
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.spinner}>
          <div className={styles.spinnerRing}></div>
          <div className={styles.spinnerRing}></div>
          <div className={styles.spinnerRing}></div>
          <span className={styles.year}>2009</span>
        </div>

        <h1 className={styles.title}>Creating Your Scene</h1>

        <div className={styles.statusContainer}>
          <p className={styles.status}>
            {status === 'queued' && 'In queue...'}
            {status === 'in_progress' && 'Generating video...'}
            {status === 'completed' && 'Processing...'}
            {status === 'Finalizing...' && 'Finalizing...'}
            {status === 'Complete!' && 'Complete!'}
          </p>
        </div>

        {/* Progress Bar */}
        <div className={styles.progressContainer}>
          <div
            className={styles.progressBar}
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <div className={styles.info}>
          <p className={styles.infoText}>
            This usually takes 2-4 minutes. Hang tight!
          </p>
          <p className={styles.infoSubtext}>
            We&apos;re using Sora 2 to generate your 8-second video scene set in 2009.
          </p>
        </div>

        {/* Fun facts while waiting */}
        <div className={styles.funFact}>
          <p className={styles.funFactTitle}>Did you know?</p>
          <p className={styles.funFactText}>
            In 2009, Bitcoin&apos;s first block (the &quot;Genesis Block&quot;) was mined on January 3rd,
            marking the birth of cryptocurrency as we know it today.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GeneratingPage() {
  return (
    <Suspense fallback={
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.spinner}>
            <div className={styles.spinnerRing}></div>
            <div className={styles.spinnerRing}></div>
            <div className={styles.spinnerRing}></div>
            <span className={styles.year}>2009</span>
          </div>
          <h1 className={styles.title}>Loading...</h1>
        </div>
      </div>
    }>
      <GeneratingPageContent />
    </Suspense>
  );
}
