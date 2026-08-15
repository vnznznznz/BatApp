import { Text as RNText, StyleSheet, type TextProps as RNTextProps } from 'react-native';

import { Colors, Typography, type TypographyVariant } from '@/constants/theme';

/** Semantic colour roles for text, rather than raw palette entries. */
const tones = {
  default: Colors.text,
  secondary: Colors.textSecondary,
  muted: Colors.textMuted,
  accent: Colors.accent,
  danger: Colors.danger,
  available: Colors.batAvailable,
  flying: Colors.batFlying,
  onAccent: Colors.onAccent,
} as const;

export type TextTone = keyof typeof tones;

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  tone?: TextTone;
  center?: boolean;
};

/**
 * The only text primitive in the app. Screens choose a semantic variant and
 * tone; they never reach for a font size or a hex value directly.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  center = false,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      style={[Typography[variant], { color: tones[tone] }, center && styles.center, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
