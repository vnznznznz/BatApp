import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { validateEmail } from '@/features/auth/validation';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const next = validateEmail(email);
    setError(next);
    setFormError(null);
    if (next) return;

    setBusy(true);
    try {
      await sendPasswordReset(email);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Something went wrong.');
      setBusy(false);
      return;
    }
    // Shown whether or not the address is registered: telling the difference
    // would let anyone check who has an account here.
    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <Screen center scroll style={styles.screen}>
        <Text variant="title" center>
          Check your email
        </Text>
        <Text variant="body" tone="secondary" center style={styles.body}>
          If there is an account for {email.trim()}, a link to set a new password is on its way.
        </Text>
        <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen scroll style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text variant="title">Set a new password</Text>
        <Text variant="caption" tone="secondary" style={styles.subtitle}>
          We will send a link to your email address.
        </Text>

        <View style={styles.form}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={error}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          {formError ? (
            <Text variant="caption" tone="danger">
              {formError}
            </Text>
          ) : null}

          <Button label="Send the link" loading={busy} onPress={submit} />
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
  body: { marginVertical: Spacing.lg },
});
