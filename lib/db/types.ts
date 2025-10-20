/**
 * Shared TypeScript types for database entities
 * Keeps types consistent across all database helper functions
 */

// ============================================================================
// MOVIES
// ============================================================================

export interface Movie {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  genre: string | null;
  themes: string[] | null;
  content_guidelines: string | null;
  creator_address: string;
  creator_fid: number | null;
  creator_display_name: string | null;
  genesis_scene_id: number | null;
  deposit_amount_wei: string | null; // NUMERIC stored as string
  scene_price_wei: string | null; // NUMERIC stored as string
  status: 'draft' | 'active' | 'paused' | 'archived';
  total_scenes: number;
  total_views: number;
  created_at: Date;
  updated_at: Date;
}

export interface MovieWithGenesis extends Movie {
  genesis_video_url: string | null;
}

export interface CreateMovieInput {
  slug: string;
  title: string;
  description?: string;
  cover_image_url?: string;
  genre?: string;
  themes?: string[];
  content_guidelines?: string;
  creator_address: string;
  creator_fid?: number;
  creator_display_name?: string;
  deposit_amount_wei?: string;
  scene_price_wei?: string;
  status?: 'draft' | 'active';
}

export interface UpdateMovieInput {
  description?: string;
  cover_image_url?: string;
  content_guidelines?: string;
  status?: 'draft' | 'active' | 'paused' | 'archived';
  total_scenes?: number;
  total_views?: number;
}

// ============================================================================
// SCENES
// ============================================================================

export interface Scene {
  id: number;
  movie_id: number;
  parent_id: number | null;
  slot: 'A' | 'B' | 'C' | null;
  locked_until: Date | null;
  locked_by_address: string | null;
  locked_by_fid: number | null;
  creator_address: string | null;
  creator_fid: number | null;
  status: SceneStatus;
  current_attempt_id: number | null;
  slot_label: string | null;
  view_count: number;
  video_job_id: string | null;
  error_message: string | null;
  last_polled_at: Date | null;
  generation_attempts: number;
  first_attempt_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type SceneStatus =
  | 'locked'
  | 'verifying_payment'
  | 'awaiting_prompt'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'lock_expired';

export interface SceneWithAttempt extends Scene {
  attempt_creator_address: string | null;
  retry_window_expires_at: Date | null;
  latest_prompt_id: number | null;
  latest_prompt_outcome: string | null;
}

export interface CreateSceneInput {
  movie_id: number;
  parent_id: number | null;
  slot: 'A' | 'B' | 'C' | null;
  locked_until?: Date;
  locked_by_address?: string;
  locked_by_fid?: number;
  status?: SceneStatus;
}

export interface UpdateSceneInput {
  status?: SceneStatus;
  locked_until?: Date | null;
  locked_by_address?: string | null;
  locked_by_fid?: number | null;
  creator_address?: string | null;
  creator_fid?: number | null;
  current_attempt_id?: number | null;
  slot_label?: string | null;
  video_job_id?: string | null;
  error_message?: string | null;
  last_polled_at?: Date | null;
  generation_attempts?: number;
  first_attempt_at?: Date | null;
}

// ============================================================================
// SCENE SLOTS (UI-friendly representation)
// ============================================================================

export interface SlotInfo {
  slot: 'A' | 'B' | 'C';
  exists: boolean;
  sceneId: number | null;
  label: string | null;
  status: SceneStatus | null;
  isLocked: boolean;
  lockedBy: string | null;
  lockedUntil: Date | null;
  attemptId: number | null;
  attemptCreator: string | null;
  expiresAt: Date | null;
  latestPromptId: number | null;
  latestPromptOutcome: string | null;
  videoUrl?: string; // Optional signed URL for pre-caching completed slots
}

// ============================================================================
// SCENE GENERATION ATTEMPTS
// ============================================================================

export interface SceneGenerationAttempt {
  id: number;
  scene_id: number;
  creator_address: string;
  creator_fid: number | null;
  transaction_hash: string | null;
  payment_confirmed_at: Date | null;
  retry_window_expires_at: Date | null;
  outcome: AttemptOutcome;
  created_at: Date;
  updated_at: Date;
}

export type AttemptOutcome = 'in_progress' | 'succeeded' | 'failed' | 'abandoned';

export interface CreateAttemptInput {
  scene_id: number;
  creator_address: string;
  creator_fid?: number;
  transaction_hash: string;
  payment_confirmed_at: Date;
  retry_window_expires_at: Date;
}

export interface UpdateAttemptInput {
  outcome?: AttemptOutcome;
  retry_window_expires_at?: Date;
}

// ============================================================================
// PROMPTS
// ============================================================================

export interface Prompt {
  id: number;
  attempt_id: number;
  prompt_text: string;
  refined_prompt_text: string | null;
  video_job_id: string | null;
  outcome: PromptOutcome;
  error_message: string | null;
  last_polled_at: Date | null;
  submitted_at: Date;
  completed_at: Date | null;
}

export type PromptOutcome =
  | 'pending'
  | 'generating'
  | 'success'
  | 'moderation_rejected'
  | 'rate_limited'
  | 'api_error'
  | 'timeout'
  | 'abandoned';

export interface CreatePromptInput {
  attempt_id: number;
  prompt_text: string;
  refined_prompt_text?: string;
  video_job_id?: string;
}

export interface UpdatePromptInput {
  outcome?: PromptOutcome;
  video_job_id?: string;
  error_message?: string | null;
  last_polled_at?: Date;
  completed_at?: Date;
}

// ============================================================================
// SCENE VIEWS (Analytics)
// ============================================================================

export interface SceneView {
  id: number;
  scene_id: number;
  viewer_address: string | null;
  viewer_fid: number | null;
  session_id: string;
  viewed_at: Date;
  referrer_scene_id: number | null;
  created_at: Date;
}

export interface CreateViewInput {
  scene_id: number;
  viewer_address?: string;
  viewer_fid?: number;
  session_id: string;
  referrer_scene_id?: number;
}

// ============================================================================
// QUERY FILTERS & OPTIONS
// ============================================================================

export interface MovieFilters {
  status?: 'draft' | 'active' | 'paused' | 'archived';
  genre?: string;
  creator_address?: string;
  search?: string; // Searches title, description, themes
}

export interface MovieSortOptions {
  sortBy?: 'created_at' | 'total_scenes' | 'total_views' | 'title';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface SceneFilters {
  movie_id?: number;
  parent_id?: number;
  status?: SceneStatus;
  creator_address?: string;
}
