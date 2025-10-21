/**
 * Movie color scheme type
 * These colors are injected as CSS variables and used by Tailwind utilities
 */
export interface MovieColorScheme {
  /** Primary brand color for the movie (buttons, CTAs, highlights) */
  primary: string;

  /** Secondary accent color (hover states, secondary elements) */
  secondary: string;

  /** Accent color for special elements */
  accent: string;

  /** Main background color */
  bg: string;

  /** Overlay background (for modals, cards) - usually with alpha */
  bgOverlay: string;

  /** Main text color */
  text: string;

  /** Muted/secondary text color - usually with reduced opacity */
  textMuted: string;
}

/**
 * Default color scheme for the "2009" movie
 * Gold/orange theme matching the current design
 */
export const DEFAULT_COLOR_SCHEME: MovieColorScheme = {
  primary: '#FFD700',      // Gold
  secondary: '#FFA500',    // Orange
  accent: '#FF6B35',       // Red-orange
  bg: '#0a0a0a',           // Near black
  bgOverlay: 'rgba(0, 0, 0, 0.85)',
  text: '#ffffff',
  textMuted: 'rgba(255, 255, 255, 0.85)',
};

/**
 * Preset color schemes for different movie aesthetics
 * Movie creators can choose from these or provide custom colors
 */
export const PRESET_COLOR_SCHEMES: Record<string, MovieColorScheme> = {
  '2009': DEFAULT_COLOR_SCHEME,

  'cyberpunk': {
    primary: '#00F0FF',      // Cyan
    secondary: '#FF00FF',    // Magenta
    accent: '#FFD700',       // Gold
    bg: '#000000',
    bgOverlay: 'rgba(0, 0, 0, 0.9)',
    text: '#00F0FF',
    textMuted: 'rgba(0, 240, 255, 0.7)',
  },

  'noir': {
    primary: '#FFFFFF',      // White
    secondary: '#808080',    // Gray
    accent: '#FF0000',       // Red
    bg: '#000000',
    bgOverlay: 'rgba(0, 0, 0, 0.95)',
    text: '#FFFFFF',
    textMuted: 'rgba(255, 255, 255, 0.6)',
  },

  'nature': {
    primary: '#4CAF50',      // Green
    secondary: '#8BC34A',    // Light green
    accent: '#FF9800',       // Orange
    bg: '#1B5E20',           // Dark green
    bgOverlay: 'rgba(27, 94, 32, 0.9)',
    text: '#FFFFFF',
    textMuted: 'rgba(255, 255, 255, 0.8)',
  },

  'horror': {
    primary: '#8B0000',      // Dark red
    secondary: '#A52A2A',    // Brown
    accent: '#FFD700',       // Gold
    bg: '#000000',
    bgOverlay: 'rgba(139, 0, 0, 0.2)',
    text: '#FFFFFF',
    textMuted: 'rgba(255, 255, 255, 0.75)',
  },
};

/**
 * Convert a MovieColorScheme to CSS variable object
 * Used for injecting into React component styles
 */
export function colorSchemeToCSS(scheme: MovieColorScheme): React.CSSProperties {
  return {
    '--movie-primary': scheme.primary,
    '--movie-secondary': scheme.secondary,
    '--movie-accent': scheme.accent,
    '--movie-bg': scheme.bg,
    '--movie-bg-overlay': scheme.bgOverlay,
    '--movie-text': scheme.text,
    '--movie-text-muted': scheme.textMuted,
  } as React.CSSProperties;
}
