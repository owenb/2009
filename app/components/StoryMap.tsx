"use client";

import React, { useEffect, useState } from "react";
import { calculateLayout } from "@/lib/storyMap/layout";
import { findPathToNode } from "@/lib/storyMap/pathfinding";
import { isSceneClickable, isSceneVisible } from "@/lib/storyMap/visibility";
import { useStoryMapData } from "@/hooks/useStoryMapData";
import { usePanZoom } from "@/hooks/usePanZoom";
import StoryMapNode from "./StoryMap/StoryMapNode";
import StoryMapEdge from "./StoryMap/StoryMapEdge";
import StoryMapControls from "./StoryMap/StoryMapControls";

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

export default function StoryMap({
  movieId = 1,
  currentSceneId = null,
  viewerAddress = null,
  onSceneSelect,
  className = ""
}: StoryMapProps) {
  const { tree, isLoading } = useStoryMapData({ movieId, viewerAddress });
  const { state: panZoomState, handlers: panZoomHandlers, setPan } = usePanZoom();
  const [positions, setPositions] = useState<Map<number, PositionedNode>>(new Map());
  const [pathToCurrentScene, setPathToCurrentScene] = useState<Set<number>>(new Set());

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
      setPan(window.innerWidth / 2 - 130, 50); // 130 is half of NODE_WIDTH
    }
  }, [tree, currentSceneId, setPan]);

  // Handle scene click
  const handleSceneClick = (scene: SceneNode) => {
    if (isSceneClickable(scene, currentSceneId, positions) && onSceneSelect) {
      onSceneSelect(scene.id);
    }
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
        const parentVisible = isSceneVisible(node, currentSceneId, pathToCurrentScene, positions);
        const childVisible = isSceneVisible(child, currentSceneId, pathToCurrentScene, positions);
        const edgeVisible = parentVisible && childVisible;

        edges.push(
          <StoryMapEdge
            key={`edge-${node.id}-${child.id}`}
            parentX={parentPos.x}
            parentY={parentPos.y}
            childX={childPos.x}
            childY={childPos.y}
            parentId={node.id}
            childId={child.id}
            isOnPath={isOnPath}
            isVisible={edgeVisible}
          />
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
      const clickable = isSceneClickable(scene, currentSceneId, positions);
      const visible = isSceneVisible(scene, currentSceneId, pathToCurrentScene, positions);

      nodes.push(
        <StoryMapNode
          key={`node-${scene.id}`}
          scene={scene}
          x={x}
          y={y}
          isGenesis={isGenesis}
          isCurrent={isCurrent}
          isOnPath={isOnPath}
          isClickable={clickable}
          isVisible={visible}
          onClick={() => handleSceneClick(scene)}
        />
      );
    });

    return nodes;
  };

  // Loading state
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

  // Empty state
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
    <div className={`w-full h-full overflow-hidden ${className}`}>
      <svg
        width="100%"
        height="100%"
        onMouseDown={panZoomHandlers.handleMouseDown}
        onMouseMove={panZoomHandlers.handleMouseMove}
        onMouseUp={panZoomHandlers.handleMouseUp}
        onMouseLeave={panZoomHandlers.handleMouseUp}
        onWheel={panZoomHandlers.handleWheel}
        onTouchStart={panZoomHandlers.handleTouchStart}
        onTouchMove={panZoomHandlers.handleTouchMove}
        onTouchEnd={panZoomHandlers.handleTouchEnd}
        style={{
          cursor: panZoomState.isDragging ? 'grabbing' : 'grab',
          touchAction: 'none'
        }}
      >
        <g transform={`translate(${panZoomState.panX}, ${panZoomState.panY}) scale(${panZoomState.zoom})`}>
          {/* Render edges first (behind nodes) */}
          {renderEdges()}
          {/* Render nodes on top */}
          {renderNodes()}
        </g>
      </svg>

      <StoryMapControls />
    </div>
  );
}
