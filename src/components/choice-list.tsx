import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Colors, Radius, Spacing } from '@/constants/theme';

export type Choice<T extends string> = {
  value: T;
  label: string;
};

export type ChoiceListProps<T extends string> = {
  /** Shown above the choices, and read out as the group's name. */
  label: string;
  choices: readonly Choice<T>[];
  /** Null until something is chosen: there is no default answer. */
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
};

/**
 * One answer from a short list: what is wrong, on the report screen.
 *
 * Each choice is a full-width row and a radio button of its own, in a named
 * group, so a screen reader says which reason it is on, that it is one of
 * several, and whether it is the one chosen.
 */
export function ChoiceList<T extends string>({
  label,
  choices,
  value,
  onChange,
  error,
}: ChoiceListProps<T>) {
  return (
    <View style={styles.group}>
      <Text variant="caption" tone="secondary" accessibilityRole="header">
        {label}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.list}>
        {choices.map((choice) => {
          const selected = choice.value === value;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={choice.label}
              onPress={() => onChange(choice.value)}
              style={({ pressed }) => [
                styles.choice,
                selected && styles.selected,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.mark, selected && styles.markSelected]}>
                {selected ? <View style={styles.dot} /> : null}
              </View>
              <Text variant="body" style={styles.text}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const MARK = 22;

const styles = StyleSheet.create({
  group: {
    gap: Spacing.sm,
  },
  list: {
    gap: Spacing.xs,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 48,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  selected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surfaceRaised,
  },
  pressed: {
    backgroundColor: Colors.surfacePressed,
  },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    borderWidth: 2,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markSelected: {
    borderColor: Colors.accent,
  },
  dot: {
    width: MARK / 2,
    height: MARK / 2,
    borderRadius: MARK / 4,
    backgroundColor: Colors.accent,
  },
  text: {
    flex: 1,
  },
});
