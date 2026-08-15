import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { BATS_PER_USER } from '@/constants/config';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import {
  validateDisplayName,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@/features/auth/validation';

type Errors = Partial<Record<'email' | 'password' | 'username' | 'displayName', string | null>>;

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const next: Errors = {
      displayName: validateDisplayName(displayName),
      username: validateUsername(username),
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(next);
    setFormError(null);
    if (Object.values(next).some(Boolean)) return;

    setBusy(true);
    try {
      const { needsEmailConfirmation } = await signUp({ email, password, username, displayName });
      // With confirmation on, no session arrives yet — say so rather than leave
      // the user on a form that appears to have done nothing. With it off, the
      // session lands immediately and the route guard takes them onward, so
      // showing "check your email" would be a lie they would wait on.
      if (needsEmailConfirmation) setSentTo(email.trim());
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <Screen center scroll style={styles.screen}>
        <Text variant="title" center>
          Check your email
        </Text>
        <Text variant="body" tone="secondary" center style={styles.confirmBody}>
          We sent a confirmation link to {sentTo}. Open it, and your {BATS_PER_USER} bats will be
          waiting.
        </Text>
        <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen scroll style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text variant="title">Join the roost</Text>
        <Text variant="caption" tone="secondary" style={styles.subtitle}>
          {BATS_PER_USER} bats come with the account. There is nothing to buy.
        </Text>

        <View style={styles.form}>
          <TextField
            label="Your name"
            value={displayName}
            onChangeText={setDisplayName}
            error={errors.displayName}
            hint="What your friends will see."
            autoCapitalize="words"
            autoComplete="name"
            returnKeyType="next"
          />
          <TextField
            label="Username"
            value={username}
            onChangeText={setUsername}
            error={errors.username}
            hint="How friends find you. Lowercase letters, numbers and underscores."
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
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
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          {formError ? (
            <Text variant="caption" tone="danger">
              {formError}
            </Text>
          ) : null}

          <Button label="Create account" loading={busy} onPress={submit} />
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
  confirmBody: { marginVertical: Spacing.lg },
});
