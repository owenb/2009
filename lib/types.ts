/**
 * Shared TypeScript types for UI components
 * These are UI-specific types distinct from database types in lib/db/types.ts
 */

import type { SlotInfo } from "./db/types";

/**
 * Scene data for video playback (returned by /api/play and /api/scenes/[id])
 */
export interface SceneData {
  sceneId: number;
  videoUrl: string;
  slotLabel: string | null;
  creatorAddress: string | null;
  creatorFid: number | null;
  createdAt: string;
  movieSlug: string;
}

/**
 * Preloaded slots data for modal display
 */
export interface PreloadedSlotsData {
  slots: SlotInfo[];
}

/**
 * Active generation attempt for resume banner
 */
export interface ActiveAttempt {
  attemptId: number;
  sceneId: number;
  parentId: number | null;
  slot: string;
  expiresAt: string;
  timeRemainingMs: number;
  latestPromptId: number | null;
  latestPromptOutcome: string | null;
  resumePage: 'create' | 'generating';
  resumeUrl: string;
}
