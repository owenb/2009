/**
 * Story Context Utility
 *
 * Fetches up to 3 previous prompts in the generation journey to maintain story continuity.
 * Traverses the scene tree backwards: child → parent → grandparent → great-grandparent
 */

import { query } from './db';

interface StoryContextPrompt {
  sceneId: number;
  slot: string;
  promptText: string;
  refinedPromptText: string | null;
  creatorAddress: string;
  depth: number; // 0 = immediate parent, 1 = grandparent, 2 = great-grandparent
}

interface StoryContext {
  prompts: StoryContextPrompt[];
  seedText: string | null; // Hardcoded context for early generations
  totalDepth: number; // How many generations back we went
}

/**
 * Hardcoded seed text for the story - used when we don't have 3 full prompts yet
 */
const SEED_TEXT = `The year is 2009. Bitcoin has just been created by the mysterious Satoshi Nakamoto. The world is on the brink of a financial revolution, but most people don't know it yet. The economy is recovering from the 2008 crisis. Technology is simpler - flip phones, early laptops, CRT monitors still in use. Social media is just beginning to take off with Facebook and early Twitter. YouTube is only 4 years old. The iPhone 3GS has just been released. This is a world about to change forever, but right now, everything feels uncertain and full of possibility.`;

interface SceneRow {
  id: number;
  parent_id: number | null;
  slot: string | null;
  current_attempt_id: number | null;
  status: string;
}

interface PromptRow {
  prompt_text: string;
  refined_prompt_text: string | null;
  creator_address: string;
}

/**
 * Get story context for a scene by traversing up to 3 generations back
 */
export async function getStoryContext(sceneId: number): Promise<StoryContext> {
  const prompts: StoryContextPrompt[] = [];
  let currentSceneId: number | null = sceneId;
  let depth = 0;
  const maxDepth = 3;

  try {
    // Traverse up the tree, collecting prompts from successful generations
    while (currentSceneId !== null && depth < maxDepth) {
      // Fetch the parent scene
      const sceneResult: { rows: SceneRow[]; rowCount: number } = await query<SceneRow>(`
        SELECT
          s.id,
          s.parent_id,
          s.slot,
          s.current_attempt_id,
          s.status
        FROM scenes s
        WHERE s.id = $1
      `, [currentSceneId]);

      if (sceneResult.rowCount === 0) {
        console.log(`Scene ${currentSceneId} not found, stopping traversal`);
        break;
      }

      const scene = sceneResult.rows[0];

      // If this is the genesis scene (parent_id is null), we've reached the root
      if (scene.parent_id === null) {
        console.log('Reached genesis scene, stopping traversal');
        break;
      }

      // Move to parent scene to get ITS prompt (the one that created current scene)
      const parentSceneId = scene.parent_id;

      // Fetch the parent scene's successful prompt
      const parentSceneResult: { rows: SceneRow[]; rowCount: number } = await query<SceneRow>(`
        SELECT
          s.id,
          s.slot,
          s.current_attempt_id,
          s.status,
          s.parent_id
        FROM scenes s
        WHERE s.id = $1 AND s.status = 'completed'
      `, [parentSceneId]);

      if (parentSceneResult.rowCount === 0) {
        console.log(`Parent scene ${parentSceneId} not completed, stopping traversal`);
        break;
      }

      const parentScene = parentSceneResult.rows[0];
      const attemptId = parentScene.current_attempt_id;

      if (!attemptId) {
        console.log(`Parent scene ${parentSceneId} has no current_attempt_id, stopping traversal`);
        break;
      }

      // Fetch the successful prompt from the attempt
      const promptResult: { rows: PromptRow[]; rowCount: number } = await query<PromptRow>(`
        SELECT
          p.prompt_text,
          p.refined_prompt_text,
          a.creator_address
        FROM prompts p
        JOIN scene_generation_attempts a ON p.attempt_id = a.id
        WHERE p.attempt_id = $1 AND p.outcome = 'success'
        ORDER BY p.submitted_at DESC
        LIMIT 1
      `, [attemptId]);

      if (promptResult.rowCount > 0) {
        const prompt = promptResult.rows[0];
        prompts.push({
          sceneId: parentSceneId,
          slot: parentScene.slot || 'unknown',
          promptText: prompt.prompt_text,
          refinedPromptText: prompt.refined_prompt_text,
          creatorAddress: prompt.creator_address,
          depth
        });

        console.log(`✓ Collected prompt from scene ${parentSceneId} at depth ${depth}`);
      }

      // Move up to the next generation
      currentSceneId = parentScene.parent_id;
      depth++;
    }

    // Determine if we need seed text (if we have fewer than 3 prompts)
    const seedText = prompts.length < maxDepth ? SEED_TEXT : null;

    console.log(`Story context collected: ${prompts.length} prompts, depth ${depth}, seed: ${seedText ? 'yes' : 'no'}`);

    return {
      prompts,
      seedText,
      totalDepth: depth
    };

  } catch (error) {
    console.error('Error fetching story context:', error);
    // Return seed text as fallback
    return {
      prompts: [],
      seedText: SEED_TEXT,
      totalDepth: 0
    };
  }
}

/**
 * Format story context for GPT prompt
 * Returns a formatted string with the story so far
 */
export function formatStoryContextForGPT(context: StoryContext): string {
  const parts: string[] = [];

  // Add seed text if present
  if (context.seedText) {
    parts.push('**STORY SETTING:**');
    parts.push(context.seedText);
    parts.push('');
  }

  // Add previous prompts in chronological order (oldest first)
  if (context.prompts.length > 0) {
    parts.push('**WHAT HAS HAPPENED SO FAR:**');
    parts.push('');

    // Reverse to show chronological order (oldest → newest)
    const chronologicalPrompts = [...context.prompts].reverse();

    chronologicalPrompts.forEach((prompt) => {
      const generation = context.totalDepth - prompt.depth;
      // Use refined prompt if available, otherwise original
      const promptToShow = prompt.refinedPromptText || prompt.promptText;
      parts.push(`Generation ${generation}: ${promptToShow}`);
      parts.push('');
    });
  }

  return parts.join('\n');
}

/**
 * Get a concise summary of what happened in previous prompts (for user display)
 * Returns a human-readable summary without exposing exact prompts
 */
export function getStoryContextSummary(context: StoryContext): string {
  if (context.prompts.length === 0) {
    return 'You are starting a new branch of the story in 2009.';
  }

  const count = context.prompts.length;
  return `Your scene will continue a story that's ${count} generation${count > 1 ? 's' : ''} deep.`;
}
