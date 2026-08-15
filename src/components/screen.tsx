import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';

export type ScreenProps = ViewProps & {
  /** Vertically centres the content. For welcome and empty states. */
  center?: boolean;
  /** Wraps content in a ScrollView. Off by default so lists own their scrolling. */
  scroll?: boolean;
  /** Removes the default horizontal padding, for edge-to-edge lists. */
  flush?: boolean;
  edges?: readonly Edge[];
};

/**
 * The outermost container for every screen: safe-area insets, the night
 * background, and consistent horizontal padding.
 */
export function Screen({
  center = false,
  scroll = false,
  flush = false,
  edges = ['top', 'bottom'],
  style,
  children,
  ...rest
}: ScreenProps) {
  const content = [!flush && styles.padded, center && styles.centered, style];

  return (
    <SafeAreaView style={styles.safe} edges={edges} {...rest}>
      {scroll ? (
        <ScrollView
          style={styles.fill}
          // `flexGrow`, never `flex`. A ScrollView content container with
          // `flex: 1` is pinned to the viewport height and cannot scroll, which
          // silently defeats the whole point of the `scroll` prop.
          contentContainerStyle={[styles.grow, ...content]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, ...content]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fill: {
    flex: 1,
  },
  grow: {
    flexGrow: 1,
  },
  padded: {
    paddingHorizontal: Spacing.lg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
