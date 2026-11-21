import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { FINISHING_SIGN_OUT, useAuth } from '@/features/auth/auth-context';
import { ConfirmEmail } from '@/features/auth/confirm-email';
import { settled, wordsOf } from '@/features/auth/settled';
import { validateEmail, validatePassword } from '@/features/auth/validation';
import { announce } from '@/lib/announce';
import { useLingering } from '@/lib/use-lingering';

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, unfinished, isSigningOut } = useAuth();
  // A sign-in whose code has confirmed the address, with the password not yet
  // saved again - the app closed in between, say - taken up where it was
  // left: the root layout brings the courier here for it.
  const [resumed] = useState(() => (unfinished?.flow === 'sign-in' ? unfinished : null));

  const [email, setEmail] = useState(resumed?.email ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The address, as sent, while it is waiting for the code that confirms it.
  const [unconfirmed, setUnconfirmed] = useState<string | null>(resumed?.email ?? null);
  // Until the courier goes back to the form from it.
  const [resuming, setResuming] = useState(resumed !== null);
  const passwordField = useRef<TextInput>(null);
  // The keyboard's "go" key is not held back by the button's spinner, and a
  // second tap can come before the spinner is drawn: once is enough.
  const inFlight = useRef(false);
  // Signing in waits for a sign-out still under way, and on a connection that
  // never answers that is a minute behind the spinner: said, once it has
  // taken a while, under the button and aloud.
  const finishingSignOut = useLingering(busy && isSigningOut);
  useEffect(() => {
    if (finishingSignOut) announce(FINISHING_SIGN_OUT);
  }, [finishingSignOut]);

  async function submit() {
    if (inFlight.current) return;
    const next = { email: validateEmail(email), password: validatePassword(password) };
    setErrors(next);
    setFormError(null);
    if (next.email || next.password) return;

    inFlight.current = true;
    setBusy(true);
    const answer = await settled(signIn(email, password));
    inFlight.current = false;
    setBusy(false);

    if (!answer.ok) {
      // Shown under the form, while a screen reader is still on the button.
      setFormError(wordsOf(answer.error));
      announce(wordsOf(answer.error));
      return;
    }
    // Otherwise the root layout sends the user onward once the session lands
    // (see RootNavigator in src/app/_layout.tsx); nothing to navigate to here.
    if (answer.value.needsEmailConfirmation) setUnconfirmed(email.trim());
  }

  if (unconfirmed) {
    // With the password signed in with: confirming the address takes it away,
    // and it is set again once the code has confirmed it.
    return (
      <ConfirmEmail
        email={unconfirmed}
        reason="not-confirmed"
        password={password}
        resumed={resuming}
        onBack={() => {
          setResuming(false);
          setUnconfirmed(null);
        }}
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
        {finishingSignOut ? (
          <Text variant="caption" tone="muted" center>
            {FINISHING_SIGN_OUT}
          </Text>
        ) : null}
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
