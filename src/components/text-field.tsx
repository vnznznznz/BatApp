import { useEffect, useState, type Ref } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/text';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { announce } from '@/lib/announce';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Shown beneath the field and announced to assistive technology. */
  error?: string | null;
  hint?: string;
  /** The text input itself, for a form that moves the focus to it. */
  ref?: Ref<TextInput>;
};

export function TextField({
  label,
  error,
  hint,
  multiline,
  accessibilityHint,
  onFocus,
  onBlur,
  ref,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  // An error appears in red under the field while focus is still on the button
  // that caused it. Spoken as it appears, it reaches someone who cannot see it.
  useEffect(() => {
    if (error) announce(`${label}: ${error}`);
  }, [error, label]);

  return (
    <View style={styles.container}>
      <Text variant="caption" tone={error ? 'danger' : 'secondary'}>
        {label}
      </Text>

      <TextInput
        ref={ref}
        accessibilityLabel={label}
        // The error, while there is one, is what a screen reader should hear
        // on returning to the field. aria-invalid reaches assistive technology
        // only on the web; native platforms ignore it.
        accessibilityHint={error ?? accessibilityHint ?? hint}
        aria-invalid={Boolean(error)}
        placeholderTextColor={Colors.textMuted}
        {...selectionColors()}
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

/**
 * The selection's colours. iOS takes the selection colour as the tint of the
 * caret, the handles and a highlight it draws see-through itself. Android
 * draws the selection colour, as given, behind the selected words and leaves
 * their colour alone, so the accent would make a solid cream block with
 * near-white text on it: there the highlight is the accent at 30% (0x4D of
 * 0xFF, after the #RRGGBB), and the caret and handles, which would otherwise
 * take the highlight's colour, keep the accent.
 */
function selectionColors(): Pick<
  TextInputProps,
  'selectionColor' | 'cursorColor' | 'selectionHandleColor'
> {
  if (Platform.OS !== 'android') return { selectionColor: Colors.accent };
  return {
    selectionColor: `${Colors.accent}4D`,
    cursorColor: Colors.accent,
    selectionHandleColor: Colors.accent,
  };
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
