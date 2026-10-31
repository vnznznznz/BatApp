import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type PressableProps,
} from 'react-native';

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
  /** Shown after the text: a badge, a chevron. Small, and not interactive. */
  trailing?: ReactNode;
  /**
   * Buttons that act on the row. Beside the text normally; below it once the
   * reader has turned their text size up, where beside it they would squeeze
   * the text - a requester's name - down to an ellipsis.
   *
   * A row with actions is never itself pressable, whatever `onPress` says:
   * VoiceOver treats a pressable row as one element, and a button inside it
   * could not be reached at all.
   */
  actions?: ReactNode;
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
  actions,
  emphasised = false,
  onPress,
  ...rest
}: ListRowProps) {
  const { fontScale } = useWindowDimensions();
  const stacked = Boolean(actions) && fontScale >= LARGE_TEXT_SCALE;

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
      {actions && !stacked ? <View style={styles.trailing}>{actions}</View> : null}
    </>
  );

  if (actions) {
    return stacked ? (
      <View style={styles.stack}>
        <View style={[styles.row, styles.stackedText]}>{content}</View>
        <View style={styles.stackedActions}>{actions}</View>
      </View>
    ) : (
      <View style={styles.row}>{content}</View>
    );
  }

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

/** The text size beyond which a row's actions move below its text. */
const LARGE_TEXT_SCALE = 1.3;

const styles = StyleSheet.create({
  stack: {
    paddingBottom: Spacing.sm,
  },
  stackedText: {
    paddingBottom: Spacing.xs,
  },
  stackedActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
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
