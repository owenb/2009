import type { SceneNode, PositionedNode } from "@/app/components/StoryMap";

// Layout constants
export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 110;
export const HORIZONTAL_GAP = 140;
export const VERTICAL_GAP = 220;
export const START_Y = 150;

/**
 * Calculate the width required for a subtree
 */
function getSubtreeWidth(node: SceneNode): number {
  if (node.children.length === 0) {
    return NODE_WIDTH;
  }

  let totalWidth = 0;
  node.children.forEach(child => {
    totalWidth += getSubtreeWidth(child);
  });

  // Add gaps between children
  totalWidth += HORIZONTAL_GAP * (node.children.length - 1);

  return Math.max(NODE_WIDTH, totalWidth);
}

/**
 * Assign positions to nodes in the tree
 */
function assignPositions(
  node: SceneNode,
  x: number,
  y: number,
  depth: number,
  positions: Map<number, PositionedNode>
) {
  const subtreeWidth = getSubtreeWidth(node);

  // Position this node in the center of its subtree
  const nodeX = x + subtreeWidth / 2;

  positions.set(node.id, {
    scene: node,
    x: nodeX,
    y: y,
    depth: depth,
  });

  // Position children
  if (node.children.length > 0) {
    let childX = x;
    const childY = y + VERTICAL_GAP;

    node.children.forEach(child => {
      const childWidth = getSubtreeWidth(child);
      assignPositions(child, childX, childY, depth + 1, positions);
      childX += childWidth + HORIZONTAL_GAP;
    });
  }
}

/**
 * Calculate tree layout using proper algorithm
 */
export function calculateLayout(root: SceneNode): Map<number, PositionedNode> {
  const positions = new Map<number, PositionedNode>();
  assignPositions(root, 0, START_Y, 0, positions);
  return positions;
}
