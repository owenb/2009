import type { SceneNode } from "@/app/components/StoryMap";

/**
 * Find path from root to target node
 */
export function findPathToNode(root: SceneNode, targetId: number): Set<number> {
  const path = new Set<number>();

  function search(node: SceneNode): boolean {
    if (node.id === targetId) {
      path.add(node.id);
      return true;
    }

    for (const child of node.children) {
      if (search(child)) {
        path.add(node.id);
        return true;
      }
    }

    return false;
  }

  search(root);
  return path;
}
