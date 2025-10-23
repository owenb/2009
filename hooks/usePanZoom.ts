import { useState } from "react";

export interface PanZoomState {
  zoom: number;
  panX: number;
  panY: number;
  isDragging: boolean;
}

export interface PanZoomHandlers {
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
  handleWheel: (e: React.WheelEvent) => void;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: () => void;
}

interface UsePanZoomOptions {
  initialZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  initialPanX?: number;
  initialPanY?: number;
}

/**
 * Hook to manage pan and zoom state with mouse and touch handlers
 */
export function usePanZoom(options: UsePanZoomOptions = {}) {
  const {
    initialZoom = 0.8,
    minZoom = 0.3,
    maxZoom = 1.5,
    initialPanX = 0,
    initialPanY = 0
  } = options;

  const [zoom, setZoom] = useState(initialZoom);
  const [panX, setPanX] = useState(initialPanX);
  const [panY, setPanY] = useState(initialPanY);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastPinchDistance, setLastPinchDistance] = useState<number | null>(null);

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
    const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom + delta));
    setZoom(newZoom);
  };

  // Touch helper
  const getTouchDistance = (touch1: React.Touch, touch2: React.Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Touch handlers for mobile pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Two fingers - pinch to zoom
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      setLastPinchDistance(distance);
    }
    // Don't handle single-finger touches - let them work as normal taps/clicks
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDistance !== null) {
      // Only prevent default for two-finger pinch gestures
      e.preventDefault();
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      const delta = (distance - lastPinchDistance) * 0.01;
      const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom + delta));
      setZoom(newZoom);
      setLastPinchDistance(distance);
    }
    // Single-finger touches: do nothing, let Base app handle them
  };

  const handleTouchEnd = () => {
    setLastPinchDistance(null);
  };

  const state: PanZoomState = { zoom, panX, panY, isDragging };
  const handlers: PanZoomHandlers = {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  };

  const setPan = (x: number, y: number) => {
    setPanX(x);
    setPanY(y);
  };

  return { state, handlers, setPan, setZoom };
}
