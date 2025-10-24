import { useState, useRef } from "react";

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
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  handlePointerCancel: (e: React.PointerEvent) => void;
}

interface UsePanZoomOptions {
  initialZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  initialPanX?: number;
  initialPanY?: number;
}

interface CachedPointer {
  pointerId: number;
  clientX: number;
  clientY: number;
}

/**
 * Hook to manage pan and zoom state with mouse and pointer events
 * Uses pointer events for better iframe/mobile support (MDN best practice)
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

  // Pointer event cache for pinch detection (MDN pattern)
  const pointerCache = useRef<CachedPointer[]>([]);
  const prevDiff = useRef<number>(-1);

  // Mouse handlers for desktop pan
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

  // Wheel handler for desktop zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * -0.0005;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom + delta));
    setZoom(newZoom);
  };

  // Pointer event helpers
  const getPointerDistance = (p1: CachedPointer, p2: CachedPointer): number => {
    const dx = p1.clientX - p2.clientX;
    const dy = p1.clientY - p2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const removePointer = (pointerId: number) => {
    const index = pointerCache.current.findIndex(p => p.pointerId === pointerId);
    if (index > -1) {
      pointerCache.current.splice(index, 1);
    }
  };

  // Pointer handlers for mobile pinch-to-zoom (MDN pattern)
  const handlePointerDown = (e: React.PointerEvent) => {
    // Add pointer to cache
    pointerCache.current.push({
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Update cached pointer
    const index = pointerCache.current.findIndex(p => p.pointerId === e.pointerId);
    if (index > -1) {
      pointerCache.current[index] = {
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY
      };
    }

    // If two pointers are down, check for pinch gestures
    if (pointerCache.current.length === 2) {
      const curDiff = getPointerDistance(pointerCache.current[0], pointerCache.current[1]);

      if (prevDiff.current > 0) {
        // Calculate zoom based on distance change
        const delta = (curDiff - prevDiff.current) * 0.01;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom + delta));
        setZoom(newZoom);
      }

      prevDiff.current = curDiff;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    removePointer(e.pointerId);

    // Reset previous diff when pinch ends
    if (pointerCache.current.length < 2) {
      prevDiff.current = -1;
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    removePointer(e.pointerId);
    if (pointerCache.current.length < 2) {
      prevDiff.current = -1;
    }
  };

  const state: PanZoomState = { zoom, panX, panY, isDragging };
  const handlers: PanZoomHandlers = {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel
  };

  const setPan = (x: number, y: number) => {
    setPanX(x);
    setPanY(y);
  };

  return { state, handlers, setPan, setZoom };
}
