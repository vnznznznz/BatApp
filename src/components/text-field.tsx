import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/text';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Shown beneath the field and announced to assistive technology. */
  error?: string | null;
  hint?: string;
};

export function TextField({
  label,
  error,
  hint,
  multiline,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      <Text variant="caption" tone={error ? 'danger' : 'secondary'}>
        {label}
      </Text>

      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        // Announces the error state rather than relying on the colour alone.
        aria-invalid={Boolean(error)}
        placeholderTextColor={Colors.textMuted}
        selectionColor={Colors.accent}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          focused && styles.inputFocused,
          Boolean(error) && styles.inputInvalid,
        ]}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  input: {
    ...Typography.body,
    color: Colors.text,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    // Height rather than vertical padding, so the field does not change size
    // between platforms or when an error appears.
    minHeight: 50,
  },
  inputMultiline: {
    minHeight: 180,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    // Android centres multiline text vertically unless told otherwise.
    textAlignVertical: 'top',
  },
  inputFocused: {
    borderColor: Colors.borderStrong,
  },
  inputInvalid: {
    borderColor: Colors.danger,
  },
});
