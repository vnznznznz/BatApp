import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { Text } from '@/components/text';
import { Colors, Radius, Spacing } from '@/constants/theme';

export type ListRowProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  /** A second line, muted. */
  subtitle?: string;
  /** A third line, for a preview of content. Clipped to two lines. */
  detail?: string;
  /** Shown before the text: an unread dot, a small mark. */
  leading?: ReactNode;
  /** Shown after the text: a badge, a time, buttons. */
  trailing?: ReactNode;
  /** Draws the title in the heading weight, for unread or otherwise new rows. */
  emphasised?: boolean;
};

/**
 * One row of a list: friends, letters, the home screen's destinations.
 *
 * Pressable only when given `onPress`; otherwise a plain row whose `trailing`
 * may carry its own buttons. Text is clipped rather than wrapped without limit,
 * so one long name cannot push a list's actions off screen.
 */
export function ListRow({
  title,
  subtitle,
  detail,
  leading,
  trailing,
  emphasised = false,
  onPress,
  ...rest
}: ListRowProps) {
  const content = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Text variant={emphasised ? 'heading' : 'body'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {detail ? (
          <Text variant="caption" tone="muted" numberOfLines={2} style={styles.detail}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row} accessible={false}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      {...rest}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    minHeight: 56,
  },
  pressed: {
    backgroundColor: Colors.surface,
  },
  leading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  detail: {
    marginTop: 2,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
