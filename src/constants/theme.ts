import { Platform, type TextStyle } from 'react-native';

/**
 * Night Courier is a nocturnal app, so it ships a single dark theme rather than
 * a light/dark pair. `app.json` pins `userInterfaceStyle` to `dark` to match.
 */
export const Colors = {
  /** Deepest layer — the night sky behind everything. */
  background: '#060912',
  /** Cards, list rows, sheets. */
  surface: '#111726',
  /** Raised surfaces: modals, roost tiles. */
  surfaceRaised: '#1A2133',
  /** Pressed state for interactive surfaces. */
  surfacePressed: '#212A40',
  border: '#232C42',
  borderStrong: '#33405E',

  /** Moonlight — primary text and the bat silhouette. */
  text: '#E9EFFA',
  textSecondary: '#94A3BE',
  textMuted: '#64708A',

  /** The moon — accents and primary actions. */
  accent: '#F6EFDB',
  accentPressed: '#D9D0BA',
  /** Text placed on top of `accent`. */
  onAccent: '#0B0F1C',

  /** Bat states, reused by the roost and the flight screen. */
  batAvailable: '#8FD6A9',
  batFlying: '#7FA6E8',

  danger: '#E2857F',
  success: '#8FD6A9',

  /** Non-interactive scrim behind modals. */
  scrim: 'rgba(6, 9, 18, 0.72)',
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

const fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', mono: 'monospace' },
})!;

export const Fonts = fonts;

/**
 * The type scale. The serif face carries the "old letters" half of the
 * identity and is reserved for display and title text; everything functional
 * is set in the system sans.
 */
export const Typography = {
  display: {
    fontFamily: fonts.serif,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: 0.4,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 0.3,
  },
  heading: {
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 24,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  caption: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  /** Countdowns and distances, so digits do not jitter as they tick. */
  mono: {
    fontFamily: fonts.mono,
    fontSize: 15,
    lineHeight: 20,
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof Typography;
