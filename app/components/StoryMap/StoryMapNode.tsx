import React from "react";
import type { SceneNode } from "../StoryMap";
import { NODE_WIDTH, NODE_HEIGHT } from "@/lib/storyMap/layout";
import { wrapText } from "@/lib/storyMap/textUtils";

interface StoryMapNodeProps {
  scene: SceneNode;
  x: number;
  y: number;
  isGenesis: boolean;
  isCurrent: boolean;
  isOnPath: boolean;
  isClickable: boolean;
  isVisible: boolean;
  onClick: () => void;
}

export default function StoryMapNode({
  scene,
  x,
  y,
  isGenesis,
  isCurrent,
  isOnPath,
  isClickable,
  isVisible,
  onClick
}: StoryMapNodeProps) {
  const boxX = x - NODE_WIDTH / 2;
  const boxY = y - NODE_HEIGHT / 2;

  // Wrap text into lines
  const textLines = isGenesis ? ['START'] : wrapText(scene.slotLabel || 'Scene');

  return (
    <g
      onClick={onClick}
      style={{ cursor: isClickable ? 'pointer' : 'not-allowed' }}
      opacity={isVisible ? 1 : 0.2}
    >
      {/* Pulsating animation filter for current scene */}
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
}
