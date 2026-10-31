import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Colors, Radius, Spacing } from '@/constants/theme';

export type BadgeProps = {
  count: number;
  /** What is being counted, for assistive technology: "unread letters". */
  label: string;
};

/**
 * A count of things waiting: unread letters, unanswered requests. Renders
 * nothing at zero, so a screen can place it unconditionally.
 */
export function Badge({ count, label }: BadgeProps) {
  if (count <= 0) return null;

  return (
    <View style={styles.badge} accessible accessibilityLabel={`${count} ${label}`}>
      <Text variant="caption" tone="onAccent" style={styles.text}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

/** A small dot marking a single unread item. */
export function UnreadDot({ visible, label = 'Unread' }: { visible: boolean; label?: string }) {
  return (
    <View
      style={[styles.dot, !visible && styles.hidden]}
      accessible={visible}
      accessibilityLabel={visible ? label : undefined}
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: Spacing.xs + 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
    lineHeight: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accent,
  },
  // Kept in the layout when read, so rows do not shift as letters are opened.
  hidden: {
    opacity: 0,
  },
});
