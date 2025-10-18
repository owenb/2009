"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./generating.module.css";

function GeneratingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const promptId = searchParams.get('promptId');
  const sceneId = searchParams.get('sceneId');

  const [status, setStatus] = useState<string>('queued');
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [progress, setProgress] = useState(0);

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

      // Redirect to success page or scene viewer
      setTimeout(() => {
        router.push(`/scene/${sceneId}?new=true`);
      }, 2000);

    } catch (err) {
      console.error('Error completing generation:', err);
      setError((err as Error).message);
    }
  }, [router, sceneId]);

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
