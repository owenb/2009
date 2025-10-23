import React from "react";
import { NODE_HEIGHT } from "@/lib/storyMap/layout";

interface StoryMapEdgeProps {
  parentX: number;
  parentY: number;
  childX: number;
  childY: number;
  parentId: number;
  childId: number;
  isOnPath: boolean;
  isVisible: boolean;
}

export default function StoryMapEdge({
  parentX,
  parentY,
  childX,
  childY,
  parentId,
  childId,
  isOnPath,
  isVisible
}: StoryMapEdgeProps) {
  // Calculate connection points (bottom of parent to top of child)
  const x1 = parentX;
  const y1 = parentY + NODE_HEIGHT / 2;
  const x2 = childX;
  const y2 = childY - NODE_HEIGHT / 2;

  // Create smooth path
  const midY = (y1 + y2) / 2;
  const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

  const markerId = `arrow-${parentId}-${childId}`;

  return (
    <g opacity={isVisible ? 1 : 0.15}>
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
          id={markerId}
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
        markerEnd={`url(#${markerId})`}
      />
    </g>
  );
}
