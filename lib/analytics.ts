/**
 * Analytics utilities for tracking user engagement
 */

const SESSION_ID_KEY = 'game_session_id';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const LAST_ACTIVITY_KEY = 'game_last_activity';

/**
 * Get or create a session ID for analytics tracking.
 * Sessions expire after 30 minutes of inactivity.
 */
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    // Server-side: return placeholder (should be called client-side only)
    return '';
  }

  const now = Date.now();
  const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
  const existingSessionId = localStorage.getItem(SESSION_ID_KEY);

  // Check if session has expired
  if (lastActivity && existingSessionId) {
    const lastActivityTime = parseInt(lastActivity, 10);
    const timeSinceLastActivity = now - lastActivityTime;

    if (timeSinceLastActivity < SESSION_TIMEOUT_MS) {
      // Session still valid - update activity time and return existing ID
      localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());
      return existingSessionId;
    }
  }

  // Create new session
  const newSessionId = crypto.randomUUID();
  localStorage.setItem(SESSION_ID_KEY, newSessionId);
  localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());

  return newSessionId;
}

/**
 * Update the last activity timestamp for session tracking
 */
export function updateSessionActivity(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
}

interface TrackSceneViewParams {
  sceneId: number;
  viewerAddress?: string;
  viewerFid?: number;
  referrerSceneId?: number;
}

/**
 * Track a scene view event
 */
export async function trackSceneView({
  sceneId,
  viewerAddress,
  viewerFid,
  referrerSceneId
}: TrackSceneViewParams): Promise<boolean> {
  try {
    const sessionId = getOrCreateSessionId();

    const response = await fetch(`/api/scenes/${sceneId}/view`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        viewerAddress,
        viewerFid,
        referrerSceneId
      }),
    });

    if (!response.ok) {
      console.error('Failed to track scene view:', await response.text());
      return false;
    }

    updateSessionActivity();
    return true;
  } catch (error) {
    console.error('Error tracking scene view:', error);
    return false;
  }
}
