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
  const inner = [styles.inner, !flush && styles.padded, center && styles.centered, style];

  return (
    <SafeAreaView style={styles.safe} edges={edges} {...rest}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[inner, center && styles.scrollCentered]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={inner}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  inner: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: Spacing.lg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollCentered: {
    flexGrow: 1,
  },
});
