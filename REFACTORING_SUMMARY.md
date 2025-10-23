# StoryMap Component Refactoring Summary

## Overview
Refactored the StoryMap and SceneMapModal components to be cleaner, more maintainable, and follow React best practices.

## Changes Made

### 1. **Utility Modules** (`lib/storyMap/`)

#### `lib/storyMap/layout.ts`
- Extracted tree layout calculation logic
- Exports constants: `NODE_WIDTH`, `NODE_HEIGHT`, `HORIZONTAL_GAP`, `VERTICAL_GAP`, `START_Y`
- Function: `calculateLayout(root)` - Computes positions for all nodes in tree

#### `lib/storyMap/pathfinding.ts`
- Extracted path-finding logic
- Function: `findPathToNode(root, targetId)` - Finds path from root to target node

#### `lib/storyMap/visibility.ts`
- Extracted scene visibility and clickability logic
- Function: `isSceneClickable()` - Determines if a scene can be clicked
- Function: `isSceneVisible()` - Implements "fog of war" visibility rules

#### `lib/storyMap/textUtils.ts`
- Extracted text wrapping utility
- Function: `wrapText(text, maxCharsPerLine)` - Wraps text for node labels

### 2. **Custom Hooks** (`hooks/`)

#### `hooks/useEscapeKey.ts`
- Reusable hook for ESC key handling
- Used in modals throughout the app
- Parameters: `onEscape` callback, `isActive` flag

#### `hooks/usePanZoom.ts`
- Encapsulates all pan/zoom state and handlers
- Manages mouse and touch events
- Returns: `state`, `handlers`, `setPan`, `setZoom`
- Handles:
  - Mouse drag to pan (desktop)
  - Scroll wheel to zoom (desktop)
  - Two-finger pinch to zoom (mobile)
  - Does NOT interfere with single-finger taps (Base app compatibility)

#### `hooks/useStoryMapData.ts`
- Encapsulates data fetching logic
- Fetches scene tree from API
- Returns: `tree`, `isLoading`, `error`

### 3. **Presentational Components** (`app/components/StoryMap/`)

#### `StoryMapNode.tsx`
- Self-contained node rendering component
- Props: scene data, position, state flags, onClick handler
- Handles all node visuals:
  - Genesis icon
  - Text wrapping and multi-line labels
  - Current scene indicator ("YOU" badge)
  - Pulsating animations
  - Glow effects

#### `StoryMapEdge.tsx`
- Self-contained edge rendering component
- Props: parent/child positions, IDs, state flags
- Renders curved SVG paths with arrow markers
- Handles edge visibility and highlighting

#### `StoryMapControls.tsx`
- Simple controls hint display
- Shows instructions for user interaction

### 4. **Main Components** (Refactored)

#### `app/components/StoryMap.tsx`
**Before:** 640 lines with mixed concerns
**After:** 210 lines, clean orchestration

Key improvements:
- Uses custom hooks for data, pan/zoom
- Delegates rendering to sub-components
- Pure business logic (visibility, clickability) in utility functions
- Clear separation of concerns
- Easier to test and maintain

#### `app/components/SceneMapModal.tsx`
**Before:** Inline ESC key handling
**After:** Uses `useEscapeKey` hook

Key improvements:
- Cleaner code (removed 12 lines of ESC handling)
- Reusable pattern for other modals
- Single responsibility principle

## Architecture Benefits

### ✅ **Separation of Concerns**
- **Data**: `useStoryMapData` hook
- **Interaction**: `usePanZoom` hook
- **Layout**: `lib/storyMap/layout.ts`
- **Business Logic**: `lib/storyMap/visibility.ts`, `lib/storyMap/pathfinding.ts`
- **Presentation**: `StoryMapNode`, `StoryMapEdge`, `StoryMapControls`
- **Orchestration**: Main `StoryMap` component

### ✅ **Reusability**
- All hooks can be used in other components
- Utility functions are pure and testable
- Sub-components can be used independently

### ✅ **Maintainability**
- Each file has single responsibility
- Easier to locate and fix bugs
- Changes are localized (e.g., changing node appearance only affects `StoryMapNode.tsx`)

### ✅ **Testability**
- Pure functions are easy to unit test
- Components can be tested in isolation
- Hooks can be tested with React Testing Library

### ✅ **Performance**
- No unnecessary re-renders (proper state management)
- Memoization opportunities (can add `React.memo` to sub-components)
- Clean separation makes optimization easier

## File Structure

```
app/
├── components/
│   ├── StoryMap.tsx              (210 lines, main orchestrator)
│   ├── SceneMapModal.tsx         (cleaner with useEscapeKey)
│   └── StoryMap/
│       ├── StoryMapNode.tsx      (node rendering)
│       ├── StoryMapEdge.tsx      (edge rendering)
│       └── StoryMapControls.tsx  (controls hint)
hooks/
├── useEscapeKey.ts               (ESC key handler)
├── usePanZoom.ts                 (pan/zoom state)
└── useStoryMapData.ts            (data fetching)
lib/
└── storyMap/
    ├── layout.ts                 (layout calculations)
    ├── pathfinding.ts            (path finding)
    ├── visibility.ts             (visibility logic)
    └── textUtils.ts              (text wrapping)
```

## Lines of Code Comparison

| File | Before | After | Change |
|------|--------|-------|--------|
| `StoryMap.tsx` | 640 | 210 | -430 (-67%) |
| `SceneMapModal.tsx` | 89 | 77 | -12 (-13%) |
| **New utility files** | 0 | ~200 | +200 |
| **New hooks** | 0 | ~120 | +120 |
| **New components** | 0 | ~200 | +200 |
| **Total** | 729 | 807 | +78 (+11%) |

While total LOC increased slightly, code quality improved dramatically:
- Better organization
- Easier to understand
- More maintainable
- Reusable components
- Testable units

## Migration Notes

- ✅ No breaking changes to public API
- ✅ All existing props and exports remain the same
- ✅ TypeScript types exported from same location
- ✅ Fully backward compatible
- ✅ Build passes with no errors

## Future Improvements

1. Add `React.memo` to `StoryMapNode` and `StoryMapEdge` for performance
2. Add unit tests for utility functions
3. Add integration tests for hooks
4. Consider using `useReducer` for complex state in `usePanZoom`
5. Add loading skeleton for better UX
6. Extract colors/styles to theme constants
