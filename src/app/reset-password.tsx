import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { Button } from '@/components/button';
import { CodeField } from '@/components/code-field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { CODE_DID_NOT_WORK, useAuth } from '@/features/auth/auth-context';
import { HoldBack } from '@/features/auth/hold-back';
import { useResendWait } from '@/features/auth/use-resend-wait';
import {
  EMAIL_CODE_LENGTH,
  validateEmail,
  validateEmailCode,
  validatePassword,
} from '@/features/auth/validation';
import { announce } from '@/lib/announce';
import { CONTACT_URL, openLink } from '@/lib/links';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // The address, as sent, once a code has been asked for.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The keyboard's "go" key is not held back by the button's spinner, and a
  // second tap can come before the spinner is drawn: one code is enough.
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;
    const next = validateEmail(email);
    setError(next);
    setFormError(null);
    if (next) return;

    inFlight.current = true;
    setBusy(true);
    try {
      await sendPasswordReset(email);
      // Shown whether or not the address is registered: telling the difference
      // would let anyone check who has an account here.
      setSentTo(email.trim());
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Something went wrong.';
      setFormError(message);
      announce(message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (sentTo) {
    return <NewPasswordForm email={sentTo} onBack={() => setSentTo(null)} />;
  }

  return (
    <Screen scroll avoidKeyboard style={styles.screen}>
      <Text variant="title">Set a new password</Text>
      <Text variant="caption" tone="secondary" style={styles.subtitle}>
        We will send a code to your email address.
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

        <Button label="Send the code" loading={busy} onPress={submit} />
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const WAIT = 'You can ask for a new code a minute after the last one.';
const NO_EMAIL = 'No email? Look in your spam folder, then ask for the code again.';

/**
 * The code from the email and the new password, on one screen. The code signs
 * the courier in, and the password is saved with that session; once it is,
 * the root layout - which holds the way in until then - takes them to the
 * roost. If it is not saved, the code is used up: they are signed in without
 * the password they chose, and are told so, and asked for it again.
 */
function NewPasswordForm({ email, onBack }: { email: string; onBack: () => void }) {
  const router = useRouter();
  const { isSettingPassword, sendPasswordReset, verifyResetCode, setNewPassword, signOut } =
    useAuth();
  // The code was right, and signed the courier in, but the password was
  // refused: it is the password alone that is still to be saved, for as long
  // as the code's sign-in holds. Only once it has been refused - the code's
  // session arrives while the password is still on its way, and nothing has
  // gone wrong then.
  const [notSaved, setNotSaved] = useState(false);
  const signedInByCode = notSaved && isSettingPassword;

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ code?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  // Saved: the root layout is taking the courier to the roost, and this screen
  // says so for as long as it is still to be seen on the way.
  const [saved, setSaved] = useState(false);
  // A code has just been asked for, whether or not the address has an account.
  const { waiting, startWaiting } = useResendWait(true);
  const passwordField = useRef<TextInput>(null);
  // The keyboard stays up while the code is checked, and its "go" key is not
  // held back by the button's spinner. Sent twice, the code was checked twice,
  // and the second check - refused, the first having used it up - is a
  // failure this screen would show while the first was signing the courier in.
  const inFlight = useRef(false);

  function failed(caught: unknown) {
    const message = caught instanceof Error ? caught.message : 'Something went wrong.';
    setFormError(message);
    announce(message);
  }

  async function submit() {
    if (inFlight.current) return;
    const next = {
      code: signedInByCode ? null : validateEmailCode(code),
      password: validatePassword(password),
    };
    setErrors(next);
    setFormError(null);
    if (next.code || next.password) return;

    inFlight.current = true;
    setBusy(true);
    try {
      if (!signedInByCode) {
        try {
          await verifyResetCode(email, code);
        } catch (caught) {
          // The code field says its own error aloud.
          if (caught instanceof Error && caught.message === CODE_DID_NOT_WORK) {
            setErrors({ code: caught.message });
          } else {
            failed(caught);
          }
          return;
        }
      }
      try {
        await setNewPassword(password);
        setSaved(true);
      } catch (caught) {
        setNotSaved(true);
        failed(caught);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function sendAgain() {
    setFormError(null);
    setResent(false);
    setSending(true);
    try {
      await sendPasswordReset(email);
      setResent(true);
      startWaiting();
      announce(resentWords(email));
    } catch (caught) {
      failed(caught);
    }
    setSending(false);
  }

  async function leave() {
    setFormError(null);
    try {
      await signOut();
      router.replace('/sign-in');
    } catch (caught) {
      failed(caught);
    }
  }

  if (saved) {
    return (
      <Screen center scroll style={styles.screen}>
        <Text variant="title" center>
          Your new password is saved
        </Text>
        <Text variant="body" tone="secondary" center style={styles.intro}>
          Your bats are waiting.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen scroll avoidKeyboard style={styles.screen}>
      {/* The code goes, or has signed the courier in: on until the password is saved. */}
      <HoldBack holding={isSettingPassword} />
      <Text variant="title">{signedInByCode ? 'Your new password' : 'Check your email'}</Text>
      <Text variant="body" tone="secondary" style={styles.intro}>
        {signedInByCode
          ? 'The code was right, and you are signed in, but the new password was not saved. ' +
            'Try again, or sign out.'
          : `If there is an account for ${email}, a code is on its way to it. Type it in below, ` +
            'with your new password.'}
      </Text>

      <View style={styles.form}>
        {signedInByCode ? null : (
          <CodeField
            label="Code"
            hint={`The ${EMAIL_CODE_LENGTH} digits from the email.`}
            value={code}
            onChangeText={setCode}
            error={errors.code}
            length={EMAIL_CODE_LENGTH}
            returnKeyType="next"
            // On without letting go of the focus first, which would close the
            // keyboard for the password to open it again.
            submitBehavior="submit"
            onSubmitEditing={() => passwordField.current?.focus()}
          />
        )}
        <TextField
          ref={passwordField}
          label="New password"
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

        <Button
          label={signedInByCode ? 'Save the new password' : 'Set the new password'}
          loading={busy}
          onPress={submit}
        />

        {signedInByCode ? (
          <Button label="Sign out" variant="ghost" onPress={leave} />
        ) : (
          <>
            <Button
              label="Send the code again"
              variant="ghost"
              loading={sending}
              disabled={waiting}
              accessibilityHint={waiting ? WAIT : undefined}
              onPress={sendAgain}
            />
            <Text variant="caption" tone="muted" style={styles.note}>
              {waiting ? (resent ? resentWords(email) : WAIT) : NO_EMAIL}
            </Text>
            <Button label="Use another address" variant="ghost" onPress={onBack} />
            {/* A code that could not be sent is taken for sent, like every
                answer that would tell whether the address has an account:
                whoever owns it needs a way to someone who can help. */}
            {CONTACT_URL ? (
              <Button label="Contact" variant="ghost" onPress={() => void openLink(CONTACT_URL)} />
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}

const resentWords = (email: string) =>
  `If there is an account for ${email}, a new code is on its way to it. Only the newest code works.`;

const styles = StyleSheet.create({
  screen: { paddingVertical: Spacing.xl },
  subtitle: { marginTop: Spacing.xs },
  intro: { marginTop: Spacing.sm },
  form: { gap: Spacing.md, marginTop: Spacing.xl },
  note: { textAlign: 'center' },
});
