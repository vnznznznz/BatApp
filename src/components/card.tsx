import { StyleSheet, View, type ViewProps } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

export type CardProps = ViewProps & {
  /** Lifts the card off the background, for the roost tiles and modals. */
  raised?: boolean;
};

export function Card({ raised = false, style, ...rest }: CardProps) {
  return <View style={[styles.card, raised && styles.raised, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  raised: {
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.borderStrong,
  },
});
