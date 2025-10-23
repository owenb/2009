"use client";

import React, { useEffect, useState } from "react";

export interface SceneNode {
  id: number;
  parentId: number | null;
  slot: 'A' | 'B' | 'C' | null;
  slotLabel: string | null;
  status: string;
  creatorAddress: string | null;
  viewCount: number;
  viewedByUser: boolean;
  children: SceneNode[];
}

export interface StoryMapProps {
  movieId?: number;
  currentSceneId?: number | null;
  viewerAddress?: string | null;
  onSceneSelect?: (sceneId: number) => void;
  className?: string;
}

export interface PositionedNode {
  scene: SceneNode;
  x: number;
  y: number;
  depth: number;
}

// Constants for layout
const NODE_WIDTH = 260;
const NODE_HEIGHT = 110;
const HORIZONTAL_GAP = 140;
const VERTICAL_GAP = 220;
const START_Y = 150;

// Word wrap text to fit in box - returns array of lines
function wrapText(text: string, maxCharsPerLine: number = 22): string[] {
  if (!text) return [''];

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

// Calculate tree layout using proper algorithm
function calculateLayout(root: SceneNode): Map<number, PositionedNode> {
  const positions = new Map<number, PositionedNode>();

  // First pass: Calculate the width each subtree needs
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

  // Second pass: Assign positions
  function assignPositions(node: SceneNode, x: number, y: number, depth: number) {
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
        assignPositions(child, childX, childY, depth + 1);
        childX += childWidth + HORIZONTAL_GAP;
      });
    }
  }

  assignPositions(root, 0, START_Y, 0);

  return positions;
}

// Find path from root to target node
function findPathToNode(root: SceneNode, targetId: number): Set<number> {
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

export default function StoryMap({
  movieId = 1,
  currentSceneId = null,
  viewerAddress = null,
  onSceneSelect,
  className = ""
}: StoryMapProps) {
  const [tree, setTree] = useState<SceneNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [positions, setPositions] = useState<Map<number, PositionedNode>>(new Map());
  const [pathToCurrentScene, setPathToCurrentScene] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(0.8);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Fetch scene tree
  useEffect(() => {
    const fetchTree = async () => {
      setIsLoading(true);
      try {
        const url = viewerAddress
          ? `/api/scenes/tree?movieId=${movieId}&viewerAddress=${encodeURIComponent(viewerAddress)}`
          : `/api/scenes/tree?movieId=${movieId}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch scene tree');
        const data = await response.json();
        setTree(data.tree);
      } catch (err) {
        console.error('Error fetching scene tree:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTree();
  }, [movieId, viewerAddress]);

  // Calculate layout when tree changes
  useEffect(() => {
    if (!tree) return;

    const layout = calculateLayout(tree);
    setPositions(layout);

    if (currentSceneId) {
      const path = findPathToNode(tree, currentSceneId);
      setPathToCurrentScene(path);
    }

    // Center view on genesis
    if (typeof window !== 'undefined') {
      setPanX(window.innerWidth / 2 - NODE_WIDTH / 2);
      setPanY(50);
    }
  }, [tree, currentSceneId]);

  // Mouse handlers for pan
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanX(e.clientX - dragStart.x);
    setPanY(e.clientY - dragStart.y);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Wheel handler for zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * -0.0005;
    const newZoom = Math.max(0.3, Math.min(1.5, zoom + delta));
    setZoom(newZoom);
  };

  // Check if a scene is clickable
  const isSceneClickable = (scene: SceneNode): boolean => {
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
  };

  // Check if a scene should be visible (fog of war)
  const isSceneVisible = (scene: SceneNode): boolean => {
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
  };

  // Render all edges
  const renderEdges = () => {
    if (!tree) return null;

    const edges: React.ReactElement[] = [];

    function collectEdges(node: SceneNode) {
      const parentPos = positions.get(node.id);
      if (!parentPos) return;

      node.children.forEach(child => {
        const childPos = positions.get(child.id);
        if (!childPos) return;

        const isOnPath = pathToCurrentScene.has(node.id) && pathToCurrentScene.has(child.id);

        // Fog of war for edges: only show if both nodes are visible
        const parentVisible = isSceneVisible(node);
        const childVisible = isSceneVisible(child);
        const edgeVisible = parentVisible && childVisible;

        // Calculate connection points (bottom of parent to top of child)
        const x1 = parentPos.x;
        const y1 = parentPos.y + NODE_HEIGHT / 2;
        const x2 = childPos.x;
        const y2 = childPos.y - NODE_HEIGHT / 2;

        // Create smooth path
        const midY = (y1 + y2) / 2;
        const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

        edges.push(
          <g key={`edge-${node.id}-${child.id}`} opacity={edgeVisible ? 1 : 0.15}>
            {/* Connection line */}
            <path
              d={pathD}
              stroke={isOnPath ? "#FFD700" : "#FFA500"}
              strokeWidth={isOnPath ? "4" : "3"}
              fill="none"
              opacity={isOnPath ? "1" : "0.6"}
            />

            {/* Arrow marker */}
            <defs>
              <marker
                id={`arrow-${node.id}-${child.id}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto"
              >
                <path
                  d="M 0 0 L 10 5 L 0 10 z"
                  fill={isOnPath ? "#FFD700" : "#FFA500"}
                  opacity={isOnPath ? "1" : "0.5"}
                />
              </marker>
            </defs>
            <path
              d={pathD}
              stroke="transparent"
              strokeWidth="1"
              fill="none"
              markerEnd={`url(#arrow-${node.id}-${child.id})`}
            />
          </g>
        );

        collectEdges(child);
      });
    }

    collectEdges(tree);
    return edges;
  };

  // Render all nodes
  const renderNodes = () => {
    const nodes: React.ReactElement[] = [];

    positions.forEach((posNode) => {
      const { scene, x, y } = posNode;
      const isGenesis = scene.parentId === null;
      const isCurrent = currentSceneId === scene.id;
      const isOnPath = pathToCurrentScene.has(scene.id);
      const clickable = isSceneClickable(scene);
      const visible = isSceneVisible(scene);

      const boxX = x - NODE_WIDTH / 2;
      const boxY = y - NODE_HEIGHT / 2;

      // Wrap text into lines
      const textLines = isGenesis ? ['START'] : wrapText(scene.slotLabel || 'Scene');

      nodes.push(
        <g
          key={`node-${scene.id}`}
          onClick={() => {
            if (clickable && onSceneSelect) {
              onSceneSelect(scene.id);
            }
          }}
          style={{ cursor: clickable ? 'pointer' : 'not-allowed' }}
          opacity={visible ? 1 : 0.2}
        >
          {/* Pulsating animation for current scene */}
          {isCurrent && (
            <defs>
              <filter id="glow-pulse" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="12" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
          )}

          {/* Node box */}
          <rect
            x={boxX}
            y={boxY}
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            fill={isCurrent ? "rgba(255, 165, 0, 0.4)" : "rgba(0, 0, 0, 0.85)"}
            stroke={isCurrent ? "#FFA500" : isOnPath ? "#FFA500" : "rgba(255, 255, 255, 0.3)"}
            strokeWidth={isCurrent ? "7" : "2"}
            rx="14"
            filter={isCurrent ? "url(#glow-pulse)" : undefined}
          >
            {isCurrent && (
              <animate
                attributeName="stroke-width"
                values="7;12;7"
                dur="1.5s"
                repeatCount="indefinite"
              />
            )}
          </rect>

          {/* Pulsating glow effect */}
          {isCurrent && (
            <rect
              x={boxX}
              y={boxY}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              fill="none"
              stroke="#FFA500"
              strokeWidth="3"
              rx="14"
              opacity="0.8"
            >
              <animate
                attributeName="opacity"
                values="0.8;0;0.8"
                dur="1.5s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="stroke-width"
                values="3;8;3"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </rect>
          )}

          {/* Genesis icon */}
          {isGenesis && (
            <text
              x={x}
              y={y - 18}
              textAnchor="middle"
              fontSize="40"
            >
              🎬
            </text>
          )}

          {/* Scene label - multi-line with word wrap */}
          <text
            x={x}
            y={y + (isGenesis ? 25 : (textLines.length === 1 ? 5 : -5))}
            textAnchor="middle"
            fill="#FFF"
            fontSize={isGenesis ? "17" : "13"}
            fontFamily="var(--font-saira)"
            fontWeight={isGenesis ? "bold" : "500"}
          >
            {textLines.map((line, i) => (
              <tspan
                key={i}
                x={x}
                dy={i === 0 ? 0 : "1.3em"}
              >
                {line}
              </tspan>
            ))}
          </text>

          {/* Current indicator badge - pulsating ORANGE */}
          {isCurrent && (
            <>
              <rect
                x={boxX + NODE_WIDTH - 60}
                y={boxY - 20}
                width="70"
                height="36"
                fill="#FFA500"
                rx="18"
                stroke="#000"
                strokeWidth="3"
              >
                <animate
                  attributeName="opacity"
                  values="1;0.7;1"
                  dur="1.5s"
                  repeatCount="indefinite"
                />
              </rect>
              <text
                x={boxX + NODE_WIDTH - 25}
                y={boxY + 3}
                textAnchor="middle"
                fill="#000"
                fontSize="17"
                fontFamily="var(--font-saira)"
                fontWeight="bold"
              >
                YOU
              </text>
            </>
          )}
        </g>
      );
    });

    return nodes;
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center w-full h-full ${className}`}>
        <div className="text-center">
          <div className="text-[#FFD700] text-4xl mb-4">🗺️</div>
          <p className="font-saira text-white/70">Loading map...</p>
        </div>
      </div>
    );
  }

  if (!tree || positions.size === 0) {
    return (
      <div className={`flex items-center justify-center w-full h-full ${className}`}>
        <div className="text-center">
          <p className="font-saira text-white/70">No scenes found</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full ${className}`}>
      <svg
        width="100%"
        height="100%"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
          {/* Render edges first (behind nodes) */}
          {renderEdges()}
          {/* Render nodes on top */}
          {renderNodes()}
        </g>
      </svg>

      {/* Controls hint */}
      <div className="absolute bottom-8 left-8 bg-black/85 border-2 border-[#FFD700]/30 rounded-lg px-5 py-3 backdrop-blur-sm pointer-events-none">
        <p className="font-saira text-white/70 text-sm m-0">
          💡 Drag to pan • Scroll to zoom • Click adjacent scenes to navigate
        </p>
      </div>
    </div>
  );
}
