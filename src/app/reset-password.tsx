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
import { settled, wordsOf } from '@/features/auth/settled';
import { StageHeading, stageWords } from '@/features/auth/stage-heading';
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
  const { sendPasswordReset, unfinished } = useAuth();
  // A reset whose code has signed the courier in, with the new password not
  // yet saved - the app closed in between, say - taken up where it was left:
  // the root layout brings the courier here for it.
  const [resumed] = useState(() => (unfinished?.flow === 'reset' ? unfinished : null));

  const [email, setEmail] = useState(resumed?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // The address, as sent, once a code has been asked for.
  const [sentTo, setSentTo] = useState<string | null>(resumed?.email ?? null);
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
    const answer = await settled(sendPasswordReset(email));
    inFlight.current = false;
    setBusy(false);

    if (!answer.ok) {
      setFormError(wordsOf(answer.error));
      announce(wordsOf(answer.error));
      return;
    }
    // Shown whether or not the address is registered: telling the difference
    // would let anyone check who has an account here.
    setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <NewPasswordForm email={sentTo} resumed={resumed !== null} onBack={() => setSentTo(null)} />
    );
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
const NOT_SAVED =
  'The code was right, and you are signed in, but the new password was not saved. ' +
  'Try again, or sign out.';
/**
 * Said of an account a reset's code confirmed that nobody had confirmed
 * before: set up by a sign-up for the address that was never finished - the
 * courier's own, or someone else's, with a password and a username of theirs.
 */
const NEVER_CONFIRMED =
  'The code was right, but this address had an account nobody had confirmed: one a sign-up ' +
  'for it left waiting for its code - perhaps yours, perhaps someone else’s, with a password ' +
  'and a username you may not have chosen.';
const REMOVED = `${NEVER_CONFIRMED} It has been removed, with nothing in it, and the address is free: sign up with it to make it yours.`;
const TO_REMOVE = `${NEVER_CONFIRMED} It has to be removed before the address can be yours, and that could not be done just now.`;

/**
 * The code from the email and the new password, on one screen. The code signs
 * the courier in, and the password is saved with that session; once it is,
 * the root layout - which holds the way in until then - takes them to the
 * roost. If it is not saved, the code is used up: they are signed in without
 * the password they chose, and are told so, and asked for it again.
 */
function NewPasswordForm({
  email,
  resumed,
  onBack,
}: {
  email: string;
  /** The code has signed the courier in already, on an earlier visit to this screen. */
  resumed: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const {
    isSettingPassword,
    unfinished,
    sendPasswordReset,
    verifyResetCode,
    setNewPassword,
    removeUnfinishedAccount,
    signOut,
  } = useAuth();
  // The code was right, and signed the courier in, but the password was
  // refused: it is the password alone that is still to be saved, for as long
  // as the code's sign-in holds. Only once it has been refused - the code's
  // session arrives while the password is still on its way, and nothing has
  // gone wrong then.
  const [notSaved, setNotSaved] = useState(resumed);
  const signedInByCode = notSaved && isSettingPassword;
  // The code confirmed an account nobody had confirmed, and it is still to be
  // removed: nothing else is to be done with it, a new password least of all.
  const toRemove = unfinished?.flow === 'reset' && unfinished.remove === true;
  // ... and once it has been.
  const [removed, setRemoved] = useState(false);

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
  const { waiting, startWaiting } = useResendWait(!resumed);
  const passwordField = useRef<TextInput>(null);
  // The keyboard stays up while the code is checked, and its "go" key is not
  // held back by the button's spinner. Sent twice, the code was checked twice,
  // and the second check - refused, the first having used it up - is a
  // failure this screen would show while the first was signing the courier in.
  const inFlight = useRef(false);
  // While the code is checked, or has signed the courier in, nothing on the
  // screen leads away from it. (Found in review: "Use another address",
  // pressed while the code was checked, left the hold behind.)
  const held = busy || isSettingPassword;

  function failed(caught: unknown) {
    setFormError(wordsOf(caught));
    announce(wordsOf(caught));
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
    await saveWithCode();
    inFlight.current = false;
    setBusy(false);
  }

  /** The code, unless it has signed the courier in already, and then the password. */
  async function saveWithCode() {
    if (!signedInByCode) {
      const checked = await settled(verifyResetCode(email, code));
      if (!checked.ok) {
        // The code field says its own error aloud.
        if (wordsOf(checked.error) === CODE_DID_NOT_WORK) setErrors({ code: CODE_DID_NOT_WORK });
        else failed(checked.error);
        return;
      }
      if (checked.value === 'removed') {
        setRemoved(true);
        return;
      }
    }

    const changed = await settled(setNewPassword(password));
    if (changed.ok) {
      setSaved(true);
      return;
    }
    // Asked again for the password alone, the reason is all that is new.
    if (signedInByCode) {
      failed(changed.error);
      return;
    }
    // The screen becomes the one that asks for the password alone. The
    // button pressed stays where it was, under another name, and a screen
    // reader on it hears what has become of the screen, and why.
    setNotSaved(true);
    setFormError(wordsOf(changed.error));
    announce(`${stageWords('Your new password', NOT_SAVED)} ${wordsOf(changed.error)}`);
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
    const left = await settled(signOut());
    if (!left.ok) {
      failed(left.error);
      return;
    }
    router.replace('/sign-in');
  }

  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setFormError(null);
    setBusy(true);
    const done = await settled(removeUnfinishedAccount());
    inFlight.current = false;
    setBusy(false);
    if (!done.ok) {
      failed(done.error);
      return;
    }
    setRemoved(true);
  }

  if (removed) {
    return (
      <Screen scroll style={styles.screen}>
        {/* Signed out: nothing held any more, and the swipe given back. */}
        <HoldBack holding={false} />
        <StageHeading key="removed" title="Sign up again" intro={REMOVED} />
        <View style={styles.form}>
          <Button label="Sign up" onPress={() => router.replace('/sign-up')} />
          <Button label="Back" variant="ghost" onPress={() => router.replace('/sign-in')} />
        </View>
      </Screen>
    );
  }

  if (toRemove && isSettingPassword) {
    return (
      <Screen scroll style={styles.screen}>
        <HoldBack holding={isSettingPassword} />
        <StageHeading key="remove" title="One more step" intro={TO_REMOVE} />
        <View style={styles.form}>
          {formError ? (
            <Text variant="caption" tone="danger">
              {formError}
            </Text>
          ) : null}
          <Button label="Try again" loading={busy} onPress={remove} />
        </View>
      </Screen>
    );
  }

  if (saved) {
    return (
      <Screen center scroll style={styles.screen}>
        <StageHeading
          key="saved"
          center
          title="Your new password is saved"
          intro="Your bats are waiting."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll avoidKeyboard style={styles.screen}>
      {/* The code goes, or has signed the courier in: on until the password is saved. */}
      <HoldBack holding={isSettingPassword} />
      <StageHeading
        key="asked"
        title={signedInByCode ? 'Your new password' : 'Check your email'}
        intro={
          signedInByCode
            ? NOT_SAVED
            : `If there is an account for ${email}, a code is on its way to it. Type it in ` +
              'below, with your new password.'
        }
      />

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
              disabled={waiting || held}
              accessibilityHint={waiting ? WAIT : undefined}
              onPress={sendAgain}
            />
            <Text variant="caption" tone="muted" style={styles.note}>
              {waiting ? (resent ? resentWords(email) : WAIT) : NO_EMAIL}
            </Text>
            <Button label="Use another address" variant="ghost" disabled={held} onPress={onBack} />
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
  form: { gap: Spacing.md, marginTop: Spacing.xl },
  note: { textAlign: 'center' },
});
