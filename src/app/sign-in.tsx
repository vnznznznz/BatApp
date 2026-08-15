import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { validateEmail, validatePassword } from '@/features/auth/validation';

export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const next = { email: validateEmail(email), password: validatePassword(password) };
    setErrors(next);
    setFormError(null);
    if (next.email || next.password) return;

    setBusy(true);
    try {
      await signIn(email, password);
      // The root guard sends the user onward once the session lands; nothing to
      // navigate to from here.
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          />
          <TextField
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
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingVertical: Spacing.xl },
  subtitle: { marginTop: Spacing.xs },
  form: { gap: Spacing.md, marginTop: Spacing.xl },
});
