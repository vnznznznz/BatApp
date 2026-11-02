import { StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/text';
import { Colors, Spacing } from '@/constants/theme';

export type ToggleRowProps = {
  label: string;
  /** What turning it on does, under the label. */
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

/**
 * A yes-or-no setting with its explanation: "Also block @ben".
 *
 * The platform's own switch, labelled with the row's words, so a screen reader
 * announces it as a switch with its state - the label beside it is for eyes.
 */
export function ToggleRow({ label, hint, value, onValueChange, disabled }: ToggleRowProps) {
  return (
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
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityHint={hint}
        trackColor={{ false: Colors.borderStrong, true: Colors.batAvailable }}
        thumbColor={Colors.text}
        ios_backgroundColor={Colors.borderStrong}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
