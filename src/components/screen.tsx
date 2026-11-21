import { use, useEffect, useState } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaInsetsContext, SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';

export type ScreenProps = ViewProps & {
  /** Vertically centres the content. For welcome and empty states. */
  center?: boolean;
  /** Wraps content in a ScrollView. Off by default so lists own their scrolling. */
  scroll?: boolean;
  /** Removes the default horizontal padding, for edge-to-edge lists. */
  flush?: boolean;
  /** Pull-to-refresh, for scrolling screens that show server data. */
  refreshControl?: ScrollViewProps['refreshControl'];
  /**
   * Keeps a scrolling form reachable above the keyboard on iOS: the scroll
   * view's insets follow the keyboard, so whatever it covers can be scrolled
   * into view, and dragging the content down puts the keyboard away. Use it
   * instead of a KeyboardAvoidingView, which inside a scroll view pads itself
   * without end, and under a navigation header comes out short by the
   * header's height. On Android every screen makes room for the keyboard
   * itself (see useAndroidKeyboardHeight).
   */
  avoidKeyboard?: boolean;
  /**
   * Which safe-area insets to pad. Screens under a navigation header leave out
   * `top`: the header has already cleared the status bar.
   */
  edges?: readonly Edge[];
};

/**
 * The outermost container for every screen: safe-area insets, the night
 * background, consistent horizontal padding, and on Android the room the
 * keyboard takes.
 */
export function Screen({
  center = false,
  scroll = false,
  flush = false,
  refreshControl,
  avoidKeyboard = false,
  edges = ['top', 'bottom'],
  style,
  children,
  ...rest
}: ScreenProps) {
  const content = [!flush && styles.padded, center && styles.centered, style];

  // The keyboard's height is what it covers above the navigation bar. Where
  // the safe area pads the bottom edge, that bar is padded already; where it
  // does not, the screen reaches the bottom of the window, and the keyboard
  // covers the bar's height as well. Read without useSafeAreaInsets, which
  // throws outside a provider; there is no bar to count there.
  const keyboard = useAndroidKeyboardHeight();
  const bar = use(SafeAreaInsetsContext)?.bottom ?? 0;
  // A floating keyboard covers no edge, and is reported as less than nothing.
  const keyboardRoom = keyboard > 0 ? keyboard + (edges.includes('bottom') ? 0 : bar) : 0;

  return (
    <SafeAreaView
      // Padding added to the bottom edge's inset, not in place of it: the
      // native view adds the two together.
      style={[styles.safe, keyboardRoom > 0 && { paddingBottom: keyboardRoom }]}
      edges={edges}
      {...rest}
    >
      {scroll ? (
        <ScrollView
          style={styles.fill}
          // `flexGrow`, never `flex`. A ScrollView content container with
          // `flex: 1` is pinned to the viewport height and cannot scroll, which
          // silently defeats the whole point of the `scroll` prop.
          contentContainerStyle={[styles.grow, ...content]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          automaticallyAdjustKeyboardInsets={avoidKeyboard}
          keyboardDismissMode={avoidKeyboard ? 'interactive' : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, ...content]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/**
 * How far the keyboard reaches above the navigation bar, on Android; 0 while
 * it is closed, and always 0 elsewhere.
 *
 * Android draws this app edge to edge, and there the system no longer makes
 * the window smaller for the keyboard: whatever lay under it stayed there, and
 * a long letter was typed out of sight. So the screen makes the room itself,
 * from the height React Native reports - the keyboard's inset less the
 * navigation bar's (ReactRootView's checkForKeyboardEvents). A scroll view or
 * list in the screen then ends where the keyboard begins, and Android scrolls
 * the field being typed in, and its caret, into what is left. iOS does this
 * with the scroll view's insets (`avoidKeyboard`).
 */
function useAndroidKeyboardHeight(): number {
  // A screen can open while the keyboard is already up - pushed from a field
  // that kept the focus - and has to make room from the start.
  const [height, setHeight] = useState(() =>
    Platform.OS === 'android' ? (Keyboard.metrics()?.height ?? 0) : 0,
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Sent again, with the new height, whenever it changes while the keyboard
    // is up - as for the emoji panel.
    const shown = Keyboard.addListener('keyboardDidShow', (event) =>
      setHeight(event.endCoordinates.height),
    );
    const hidden = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return height;
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
