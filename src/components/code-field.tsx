import { Platform } from 'react-native';

import { TextField, type TextFieldProps } from '@/components/text-field';

export type CodeFieldProps = Omit<TextFieldProps, 'value' | 'onChangeText'> & {
  value: string;
  /** Handed the digits only, and no more of them than a code has. */
  onChangeText: (code: string) => void;
  /** How many digits a code has. */
  length: number;
};

/**
 * The field for a code from an email: the number pad, and the system's offer
 * to fill the code in from the message it came in. iOS reads that from
 * textContentType. Android reads autoComplete, which React Native 0.86 calls
 * "sms-otp" there and passes on as Android's autofill hint for one-time codes
 * (ReactTextInputManager); it would turn "one-time-code" into the same
 * (TextInput.js), but says it in Android's own words here, as the web's
 * autocomplete attribute gets its own.
 */
export function CodeField({ value, onChangeText, length, ...rest }: CodeFieldProps) {
  return (
    <TextField
      value={value}
      // Pasted, a code comes with the words around it, and some mail apps
      // space its digits; only the digits are the code. No maxLength for the
      // same reason: it would cut a spaced code short before it got here.
      onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, length))}
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
      autoCapitalize="none"
      autoCorrect={false}
      {...rest}
    />
  );
}
