import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CodeField } from '@/components/code-field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { BATS_PER_USER } from '@/constants/config';
import { Spacing } from '@/constants/theme';
import {
  CODE_DID_NOT_WORK,
  SetUpAgainFailed,
  useAuth,
  type SignUpDetails,
} from '@/features/auth/auth-context';
import { HoldBack } from '@/features/auth/hold-back';
import { StageHeading, stageWords } from '@/features/auth/stage-heading';
import { useResendWait } from '@/features/auth/use-resend-wait';
import { EMAIL_CODE_LENGTH, validateEmailCode } from '@/features/auth/validation';
import { announce } from '@/lib/announce';

type ConfirmEmailProps = {
  /** The address the code went to, as it was sent. */
  email: string;
  /** Back to the form the courier came from, everything typed still in it. */
  onBack: () => void;
} & (
  | {
      /**
       * Straight from signing up, when a code has gone to the address if it is
       * new - with what was typed, to set the account up with once the code
       * has confirmed it.
       */
      reason: 'signed-up';
      details: SignUpDetails;
    }
  | {
      /**
       * From signing in with the right password to an account whose address
       * is still waiting for its code.
       */
      reason: 'not-confirmed';
    }
);

const WAIT = 'You can ask for a new code a minute after the last one.';
const NO_EMAIL = 'No email? Look in your spam folder, then ask for the code again.';
const UNFINISHED =
  'Your address is confirmed, and you are signed in, but your account could not be finished ' +
  'just now. Try again - or sign out, and sign in later with "I forgot my password".';

/**
 * Asks for the code that confirms an account's address. The right one signs
 * the courier in, and the root layout takes them to the roost.
 *
 * After signing up the screen says only what is true whether or not the
 * address had an account before: the auth server answers for both alike as
 * far as the app lets it, and the screen must not tell a stranger the
 * difference either. And the account the code confirms is made the one the
 * courier set up before the way in opens: an earlier sign-up for the address,
 * anyone's, may have set it up with a password of its own (see finishSignUp).
 */
export function ConfirmEmail(props: ConfirmEmailProps) {
  const { email, onBack } = props;
  // What was typed at sign-up; nothing from signing in.
  const details = props.reason === 'signed-up' ? props.details : null;
  const signedUp = details !== null;
  const router = useRouter();
  const {
    isSettingPassword,
    confirmEmail,
    confirmSignUp,
    finishSignUp,
    resendConfirmationCode,
    signOut,
  } = useAuth();

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  // The code was right, and signed the courier in, but the account could not
  // be set up as they set it up: that alone is still to be done, for as long
  // as the code's sign-in holds.
  const [notFinished, setNotFinished] = useState(false);
  const unfinished = notFinished && isSettingPassword;
  // An earlier sign-up's account made way for the courier's, and a new code
  // has gone out for theirs.
  const [setUpAgain, setSetUpAgain] = useState(false);
  // A code has just gone - or the address has an account, and none has: the
  // minute is waited for both alike. One from signing in may be days old.
  const { waiting, startWaiting } = useResendWait(signedUp);
  // The number pad's "go" key is not held back by the button's spinner, and a
  // code sent twice is refused the second time, the first having used it up.
  const inFlight = useRef(false);

  function failed(error: unknown, { atTheCode = false } = {}) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    // The code field says its own error aloud.
    if (atTheCode && message === CODE_DID_NOT_WORK) {
      setCodeError(message);
      return;
    }
    setFormError(message);
    announce(message);
  }

  async function confirm() {
    if (inFlight.current) return;
    setFormError(null);
    if (!unfinished) {
      const invalid = validateEmailCode(code);
      setCodeError(invalid);
      if (invalid) return;
    }

    inFlight.current = true;
    setBusy(true);
    try {
      if (!unfinished) {
        try {
          // Signed in. From signing in, the root layout sends the courier on
          // (src/app/_layout.tsx); after signing up it waits for the account.
          if (details) await confirmSignUp(email, code);
          else await confirmEmail(email, code);
        } catch (error) {
          failed(error, { atTheCode: true });
          return;
        }
      }
      if (details) await finish(details);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function finish(chosen: SignUpDetails) {
    try {
      const outcome = await finishSignUp(chosen);
      // Signed in, the account the courier's: the root layout sends them on.
      if (outcome === 'signed in') return;
      setCode('');
      setResent(false);
      setSetUpAgain(true);
      startWaiting();
      announce(stageWords('One more code', setUpAgainWords(email)));
    } catch (error) {
      // Signed out, the earlier account gone: the code stage, with the reason.
      // Or asked again on the screen that says the account is not finished:
      // the reason is all that is new.
      if (error instanceof SetUpAgainFailed || unfinished) {
        failed(error);
        return;
      }
      // Still signed in by the code, and held: the screen becomes the one
      // that asks to try again. The button pressed stays where it was, under
      // another name, and a screen reader on it hears what has become of the
      // screen, and why.
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      setNotFinished(true);
      setFormError(message);
      announce(`${stageWords('Almost there', UNFINISHED)} ${message}`);
    }
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
      failed(error);
    }
    setSending(false);
  }

  async function leave() {
    setFormError(null);
    try {
      await signOut();
      router.replace('/sign-in');
    } catch (error) {
      failed(error);
    }
  }

  if (unfinished) {
    return (
      <Screen scroll avoidKeyboard style={styles.screen}>
        <HoldBack holding={isSettingPassword} />
        <StageHeading title="Almost there" intro={UNFINISHED} />
        <View style={styles.form}>
          {formError ? (
            <Text variant="caption" tone="danger">
              {formError}
            </Text>
          ) : null}
          <Button label="Try again" loading={busy} onPress={confirm} />
          <Button label="Sign out" variant="ghost" onPress={leave} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll avoidKeyboard style={styles.screen}>
      {/* After signing up the code goes, or has signed the courier in: on until the
          account is theirs. From signing in, nothing is held. */}
      <HoldBack holding={isSettingPassword} />
      <StageHeading
        title={
          setUpAgain ? 'One more code' : signedUp ? 'Check your email' : 'Confirm your address'
        }
        intro={
          setUpAgain
            ? setUpAgainWords(email)
            : signedUp
              ? `If ${email} is new here, a code is on its way to it. Type it in below, and your ` +
                `${BATS_PER_USER} bats will be waiting. If you already have an account, sign in instead.`
              : `Your account is waiting for the code we sent to ${email}. Type it in below. If you ` +
                'cannot find it, or it no longer works, ask for a new one.'
        }
      />

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

/**
 * Said once an account an earlier sign-up for the address had set up - with
 * another username, by the courier on another day or by someone else - has
 * been removed, and the courier's own set up in its place.
 */
const setUpAgainWords = (email: string) =>
  'This address had an account waiting for its code already, set up with another username - ' +
  `perhaps from an earlier try. It has made way for yours, and a new code is on its way to ${email}. ` +
  'Type the new code in below.';

const styles = StyleSheet.create({
  screen: { paddingVertical: Spacing.xl },
  form: { gap: Spacing.md, marginTop: Spacing.xl },
  note: { textAlign: 'center' },
});
