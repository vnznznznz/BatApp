import { Platform, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/text';
import { Colors, Spacing } from '@/constants/theme';

export type ToggleRowProps = {
  label: string;
  /** What turning it on does, under the label. */
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /** What is wrong, shown under the row and read as the switch's hint. */
  error?: string | null;
};

/**
 * A yes-or-no setting with its explanation: "Also block @ben".
 *
 * The platform's own switch, labelled with the row's words, so a screen reader
 * announces it as a switch with its state - the label beside it is for eyes.
 */
export function ToggleRow({ label, hint, value, onValueChange, disabled, error }: ToggleRowProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text variant="body">{label}</Text>
          {hint ? (
            <Text variant="caption" tone="muted" style={styles.hint}>
              {hint}
            </Text>
          ) : null}
        </View>
        <Switch
          {...ON_WEB}
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          trackColor={{ false: Colors.borderStrong, true: Colors.batAvailable }}
          thumbColor={Colors.text}
          ios_backgroundColor={Colors.borderStrong}
        />
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * React Native Web paints the knob of a switch that is on with its own
 * `activeThumbColor`, a Material teal unless told otherwise, and ignores
 * `thumbColor` for that state. Not part of React Native's own types.
 */
const ON_WEB: object = Platform.OS === 'web' ? { activeThumbColor: Colors.text } : {};

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 48,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  hint: {
    lineHeight: 19,
  },
});
