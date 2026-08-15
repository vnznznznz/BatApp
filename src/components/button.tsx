import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/components/text';
import { Colors, Radius, Spacing } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  variant = 'primary',
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
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
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
