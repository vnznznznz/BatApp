import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CodeField } from '@/components/code-field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { BATS_PER_USER } from '@/constants/config';
import { Spacing } from '@/constants/theme';
import { CODE_DID_NOT_WORK, useAuth } from '@/features/auth/auth-context';
import { useResendWait } from '@/features/auth/use-resend-wait';
import { EMAIL_CODE_LENGTH, validateEmailCode } from '@/features/auth/validation';
import { announce } from '@/lib/announce';

type ConfirmEmailProps = {
  /** The address the code went to, as it was sent. */
  email: string;
  /**
   * How the courier got here: straight from signing up, when a code has gone
   * to the address if it is new; or from signing in with the right password
   * to an account whose address is still waiting for its code.
   */
  reason: 'signed-up' | 'not-confirmed';
  /** Back to the form the courier came from, everything typed still in it. */
  onBack: () => void;
};

const WAIT = 'You can ask for a new code a minute after the last one.';
const NO_EMAIL = 'No email? Look in your spam folder, then ask for the code again.';

/**
 * Asks for the code that confirms an account's address. The right one signs
 * the courier in, and the root layout takes them to the roost.
 *
 * After signing up the screen says only what is true whether or not the
 * address had an account before: the auth server answers for both alike as
 * far as the app lets it, and the screen must not tell a stranger the
 * difference either.
 */
export function ConfirmEmail({ email, reason, onBack }: ConfirmEmailProps) {
  const router = useRouter();
  const { confirmEmail, resendConfirmationCode } = useAuth();
  const signedUp = reason === 'signed-up';

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  // A code has just gone - or the address has an account, and none has: the
  // minute is waited for both alike. One from signing in may be days old.
  const { waiting, startWaiting } = useResendWait(signedUp);

  async function confirm() {
    const invalid = validateEmailCode(code);
    setCodeError(invalid);
    setFormError(null);
    if (invalid) return;

    setBusy(true);
    try {
      await confirmEmail(email, code);
      // Signed in: the root layout sends the courier on (src/app/_layout.tsx).
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      // The code field says its own error aloud.
      if (message === CODE_DID_NOT_WORK) {
        setCodeError(message);
      } else {
        setFormError(message);
        announce(message);
      }
    }
    setBusy(false);
  }

  async function sendAgain() {
    setFormError(null);
    setResent(false);
    setSending(true);
    try {
      await resendConfirmationCode(email);
      setResent(true);
      startWaiting();
      announce(resentWords(email, signedUp));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      setFormError(message);
      announce(message);
    }
    setSending(false);
  }

  return (
    <Screen scroll avoidKeyboard style={styles.screen}>
      <Text variant="title">{signedUp ? 'Check your email' : 'Confirm your address'}</Text>
      <Text variant="body" tone="secondary" style={styles.intro}>
        {signedUp
          ? `If ${email} is new here, a code is on its way to it. Type it in below, and your ` +
            `${BATS_PER_USER} bats will be waiting. If you already have an account, sign in instead.`
          : `Your account is waiting for the code we sent to ${email}. Type it in below. If you ` +
            'cannot find it, or it no longer works, ask for a new one.'}
      </Text>

      <View style={styles.form}>
        <CodeField
          label="Code"
          hint={`The ${EMAIL_CODE_LENGTH} digits from the email.`}
          value={code}
          onChangeText={setCode}
          error={codeError}
          length={EMAIL_CODE_LENGTH}
          returnKeyType="go"
          onSubmitEditing={confirm}
        />

        {formError ? (
          <Text variant="caption" tone="danger">
            {formError}
          </Text>
        ) : null}

        <Button label="Confirm" loading={busy} onPress={confirm} />

        <Button
          label="Send the code again"
          variant="ghost"
          loading={sending}
          disabled={waiting}
          accessibilityHint={waiting ? WAIT : undefined}
          onPress={sendAgain}
        />
        <Text variant="caption" tone="muted" style={styles.note}>
          {waiting ? (resent ? resentWords(email, signedUp) : WAIT) : NO_EMAIL}
        </Text>

        {signedUp ? (
          <>
            <Button
              label="Sign in instead"
              variant="ghost"
              onPress={() => router.replace('/sign-in')}
            />
            <Button label="Change the address" variant="ghost" onPress={onBack} />
            {/* A mistyped address has an account now, with the username, until
                the tidy-up deletes a sign-up that was never confirmed. */}
            <Text variant="caption" tone="muted" style={styles.note}>
              Wrong address? Go back and correct it. You may need another username then: the one you
              chose can stay with this address for about a week.
            </Text>
          </>
        ) : (
          <Button label="Back" variant="ghost" onPress={onBack} />
        )}
      </View>
    </Screen>
  );
}

/**
 * Said once a new code has been asked for. After signing up, the address may
 * have had an account all along, and then nothing was sent.
 */
const resentWords = (email: string, signedUp: boolean) =>
  signedUp
    ? `If ${email} is new here, a new code is on its way to it. Only the newest code works.`
    : `A new code is on its way to ${email}. Only the newest code works.`;

const styles = StyleSheet.create({
  screen: { paddingVertical: Spacing.xl },
  intro: { marginTop: Spacing.sm },
  form: { gap: Spacing.md, marginTop: Spacing.xl },
  note: { textAlign: 'center' },
});
