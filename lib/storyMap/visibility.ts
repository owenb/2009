import type { SceneNode, PositionedNode } from "@/app/components/StoryMap";

/**
 * Check if a scene is clickable based on current position and view history
 */
export function isSceneClickable(
  scene: SceneNode,
  currentSceneId: number | null,
  positions: Map<number, PositionedNode>
): boolean {
  if (!currentSceneId) return scene.viewedByUser; // Only allow visited scenes if no current
  if (scene.id === currentSceneId) return false; // Can't click current scene

  // Can teleport to any visited scene
  if (scene.viewedByUser) return true;

  // Can click parent (go back)
  if (scene.children.some(child => child.id === currentSceneId)) {
    return true;
  }

  // Can click children (go forward)
  const currentNode = Array.from(positions.values()).find(p => p.scene.id === currentSceneId);
  if (currentNode && currentNode.scene.children.some(child => child.id === scene.id)) {
    return true;
  }

  return false;
}

/**
 * Check if a scene should be visible (fog of war)
 */
export function isSceneVisible(
  scene: SceneNode,
  currentSceneId: number | null,
  pathToCurrentScene: Set<number>,
  positions: Map<number, PositionedNode>
): boolean {
  if (!currentSceneId) return true;

  // Current scene: always visible
  if (scene.id === currentSceneId) return true;

  // Visited scenes: always visible (can teleport)
  if (scene.viewedByUser) return true;

  // Scenes on the path from START to current: always visible
  if (pathToCurrentScene.has(scene.id)) return true;

  // Direct children of current scene: visible (can see next options)
  const currentNode = Array.from(positions.values()).find(p => p.scene.id === currentSceneId);
  if (currentNode && currentNode.scene.children.some(child => child.id === scene.id)) {
    return true;
  }

  // Parent of current scene: visible (can see where you came from)
  if (scene.children.some(child => child.id === currentSceneId)) {
    return true;
  }

  // Everything else: fogged
  return false;
}
