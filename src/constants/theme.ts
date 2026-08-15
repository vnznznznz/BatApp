import { Platform } from 'react-native';

/**
 * Night Courier is a nocturnal app, so it ships a single dark theme rather than
 * a light/dark pair. `app.json` pins `userInterfaceStyle` to `dark` to match.
 */
export const Colors = {
  /** Deepest layer — the night sky behind everything. */
  background: '#070A14',
  /** Cards, list rows, sheets. */
  surface: '#111726',
  /** Raised surfaces: modals, the bat roost tiles. */
  surfaceRaised: '#1A2133',
  border: '#232C42',

  /** Moonlight — primary text and the bat silhouette. */
  text: '#E9EFFA',
  textSecondary: '#94A3BE',
  textMuted: '#64708A',

  /** The moon — accents, primary actions. */
  accent: '#F3EAD2',
  accentPressed: '#C9BE9E',
  /** Text placed on top of `accent`. */
  onAccent: '#0B0F1C',

  /** Bat states, reused by the roost and the flight screen. */
  batAvailable: '#8FD6A9',
  batFlying: '#7FA6E8',

  danger: '#E2857F',
  success: '#8FD6A9',
} as const;

export type ColorName = keyof typeof Colors;

/** 4pt base scale. */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const FontSize = {
  caption: 13,
  body: 16,
  title: 22,
  display: 32,
} as const;

/**
 * The serif face carries the "old letters" half of the identity; the sans face
 * is used for controls and metadata.
 */
export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', mono: 'monospace' },
});
