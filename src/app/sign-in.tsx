import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { ConfirmEmail } from '@/features/auth/confirm-email';
import { validateEmail, validatePassword } from '@/features/auth/validation';

export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The address, as sent, while it is waiting for the code that confirms it.
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const passwordField = useRef<TextInput>(null);

  async function submit() {
    const next = { email: validateEmail(email), password: validatePassword(password) };
    setErrors(next);
    setFormError(null);
    if (next.email || next.password) return;

    setBusy(true);
    try {
      const { needsEmailConfirmation } = await signIn(email, password);
      // Otherwise the root layout sends the user onward once the session lands
      // (see RootNavigator in src/app/_layout.tsx); nothing to navigate to here.
      if (needsEmailConfirmation) setUnconfirmed(email.trim());
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (unconfirmed) {
    return (
      <ConfirmEmail
        email={unconfirmed}
        reason="not-confirmed"
        onBack={() => setUnconfirmed(null)}
      />
    );
  }

  return (
    <Screen scroll avoidKeyboard style={styles.screen}>
      <Text variant="title">Welcome back</Text>
      <Text variant="caption" tone="secondary" style={styles.subtitle}>
        Your bats have been waiting.
      </Text>

      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          // On to the password without letting go of the focus first, which
          // would close the keyboard for the password to open it again.
          submitBehavior="submit"
          onSubmitEditing={() => passwordField.current?.focus()}
        />
        <TextField
          ref={passwordField}
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        {formError ? (
          <Text variant="caption" tone="danger">
            {formError}
          </Text>
        ) : null}

        <Button label="Sign in" loading={busy} onPress={submit} />
        <Button
          label="I forgot my password"
          variant="ghost"
          onPress={() => router.push('/reset-password')}
        />
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingVertical: Spacing.xl },
  subtitle: { marginTop: Spacing.xs },
  form: { gap: Spacing.md, marginTop: Spacing.xl },
});
