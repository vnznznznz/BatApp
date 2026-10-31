import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/components/text';
import { Colors, Radius, Spacing } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonSize = 'regular' | 'compact';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  /** `compact` fits inside a list row, beside the text it acts on. */
  size?: ButtonSize;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  variant = 'primary',
  size = 'regular',
  loading = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  // A button mid-request must not be pressable again, so loading implies disabled.
  const isDisabled = disabled === true || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      // A compact button is drawn 36pt tall to sit in a list row; the touch
      // target still reaches the 44pt the platforms ask for.
      hitSlop={size === 'compact' ? COMPACT_HIT_SLOP : undefined}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === 'compact' && styles.compact,
        variants[variant].container,
        pressed && !isDisabled && variants[variant].pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {/* Kept in the tree while loading so the button does not change width. */}
      <Text variant="label" tone={variants[variant].tone} style={loading && styles.hidden}>
        {label}
      </Text>
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color={Colors[variant === 'primary' ? 'onAccent' : 'text']} />
        </View>
      ) : null}
    </Pressable>
  );
}

// 36pt drawn plus slop on each side: 44pt, Apple's minimum, and on Android
// 48dp, Material's.
const COMPACT_SLOP = Platform.OS === 'android' ? 6 : 4;
const COMPACT_HIT_SLOP = {
  top: COMPACT_SLOP,
  bottom: COMPACT_SLOP,
  left: COMPACT_SLOP,
  right: COMPACT_SLOP,
};

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  compact: {
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
  },
  disabled: {
    opacity: 0.45,
  },
  hidden: {
    opacity: 0,
  },
  spinner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const variants = {
  primary: {
    container: { backgroundColor: Colors.accent },
    pressed: { backgroundColor: Colors.accentPressed },
    tone: 'onAccent',
  },
  secondary: {
    container: { backgroundColor: Colors.surfaceRaised, borderColor: Colors.border },
    pressed: { backgroundColor: Colors.surfacePressed },
    tone: 'default',
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    pressed: { backgroundColor: Colors.surface },
    tone: 'secondary',
  },
  danger: {
    container: { backgroundColor: 'transparent', borderColor: Colors.danger },
    pressed: { backgroundColor: Colors.surface },
    tone: 'danger',
  },
} as const;
