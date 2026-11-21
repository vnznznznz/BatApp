import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CodeField } from '@/components/code-field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { BATS_PER_USER } from '@/constants/config';
import { Spacing } from '@/constants/theme';
import {
  CODE_DID_NOT_WORK,
  SetUpAgainFailed,
  useAuth,
  type SignUpDetails,
} from '@/features/auth/auth-context';
import { HoldBack } from '@/features/auth/hold-back';
import { settled, wordsOf } from '@/features/auth/settled';
import { StageHeading, stageWords } from '@/features/auth/stage-heading';
import { useResendWait } from '@/features/auth/use-resend-wait';
import { EMAIL_CODE_LENGTH, validateEmailCode, validatePassword } from '@/features/auth/validation';
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
      /**
       * The code has signed the courier in already, on an earlier visit to
       * this screen - before the app was closed, say - and the account is
       * still to be set up. The password was never kept: it is asked for.
       */
      resumed?: boolean;
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
const START_OVER =
  'Or start over: the account is removed, with nothing in it, and you can sign up again.';
const UNFINISHED =
  'Your address is confirmed, but your account is not finished: it still has to be given ' +
  `the password and the name you chose. Try again. ${START_OVER}`;
const RESUMED =
  'Your address is confirmed, but your account is not finished: it still has to be given ' +
  `your password - the one you chose before, or a new one. ${START_OVER}`;
const STARTED_OVER = 'The account has been removed. You can sign up again.';

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
 * Until then nothing on the screen leads anywhere else: signing out would
 * leave the account, confirmed now, with that password. Starting over removes
 * it first.
 */
export function ConfirmEmail(props: ConfirmEmailProps) {
  const { email, onBack } = props;
  // What was typed at sign-up; nothing from signing in.
  const details = props.reason === 'signed-up' ? props.details : null;
  const resumed = props.reason === 'signed-up' && props.resumed === true;
  const signedUp = details !== null;
  const router = useRouter();
  const {
    isSettingPassword,
    confirmEmail,
    confirmSignUp,
    finishSignUp,
    removeUnfinishedAccount,
    resendConfirmationCode,
  } = useAuth();

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  // Asked for only when the screen did not see it typed (`resumed`).
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [removing, setRemoving] = useState(false);
  // The code was right, and signed the courier in, but the account could not
  // be set up as they set it up: that alone is still to be done, for as long
  // as the code's sign-in holds.
  const [notFinished, setNotFinished] = useState(resumed);
  const unfinished = notFinished && isSettingPassword;
  // An earlier sign-up's account made way for the courier's, and a new code
  // has gone out for theirs.
  const [setUpAgain, setSetUpAgain] = useState(false);
  // A code has just gone - or the address has an account, and none has: the
  // minute is waited for both alike. One from signing in may be days old.
  const { waiting, startWaiting } = useResendWait(signedUp && !resumed);
  // The number pad's "go" key is not held back by the button's spinner, and a
  // code sent twice is refused the second time, the first having used it up.
  const inFlight = useRef(false);
  // While a code is checked, or the account it confirmed is not finished,
  // nothing on the screen leads away from it. (Found in review: "Sign in
  // instead", pressed while the code was checked, led into the app.)
  const held = busy || removing || isSettingPassword;
  // The password the account is to be given: as typed at sign-up, or here.
  const chosen = details ? { ...details, password: details.password || password } : null;
  const askForPassword = details !== null && !details.password;

  function failed(error: unknown, { atTheCode = false } = {}) {
    // The code field says its own error aloud.
    if (atTheCode && wordsOf(error) === CODE_DID_NOT_WORK) {
      setCodeError(CODE_DID_NOT_WORK);
      return;
    }
    setFormError(wordsOf(error));
    announce(wordsOf(error));
  }

  async function confirm() {
    if (inFlight.current) return;
    setFormError(null);
    if (unfinished && askForPassword) {
      const invalid = validatePassword(password);
      setPasswordError(invalid);
      if (invalid) return;
    }
    if (!unfinished) {
      const invalid = validateEmailCode(code);
      setCodeError(invalid);
      if (invalid) return;
    }

    inFlight.current = true;
    setBusy(true);
    await confirmThenFinish();
    inFlight.current = false;
    setBusy(false);
  }

  /** The code, unless it has signed the courier in already, and then the account. */
  async function confirmThenFinish() {
    if (!unfinished) {
      // A code to check: whatever was left unfinished before was signed out
      // of, and this one starts afresh.
      setNotFinished(false);
      // Signed in. From signing in, the root layout sends the courier on
      // (src/app/_layout.tsx); after signing up it waits for the account.
      const checked = await settled(
        chosen ? confirmSignUp(chosen, code) : confirmEmail(email, code),
      );
      if (!checked.ok) {
        failed(checked.error, { atTheCode: true });
        return;
      }
    }
    if (chosen) await finish(chosen);
  }

  async function finish(account: SignUpDetails) {
    const done = await settled(finishSignUp(account));
    if (done.ok) {
      // Signed in, the account the courier's: the root layout sends them on.
      if (done.value === 'signed in') return;
      setCode('');
      setResent(false);
      setSetUpAgain(true);
      startWaiting();
      announce(stageWords('One more code', setUpAgainWords(email)));
      return;
    }
    // Signed out: the code stage, with the reason.
    if (done.error instanceof SetUpAgainFailed) {
      failed(done.error);
      return;
    }
    // Asked again on the screen that says the account is not finished: the
    // reason is all that is new.
    if (unfinished) {
      failed(done.error);
      return;
    }
    // Still signed in by the code, and held: the screen becomes the one that
    // asks to try again. The button pressed stays where it was, under another
    // name, and a screen reader on it hears what has become of the screen, and
    // why.
    setNotFinished(true);
    setFormError(wordsOf(done.error));
    announce(`${stageWords('Almost there', UNFINISHED)} ${wordsOf(done.error)}`);
  }

  async function startOver() {
    if (inFlight.current) return;
    inFlight.current = true;
    setFormError(null);
    setRemoving(true);
    const removed = await settled(removeUnfinishedAccount());
    inFlight.current = false;
    setRemoving(false);
    if (!removed.ok) {
      failed(removed.error);
      return;
    }
    // Signed out, the account gone: back to the form, with what was typed.
    announce(STARTED_OVER);
    onBack();
  }

  async function sendAgain() {
    setFormError(null);
    setResent(false);
    setSending(true);
    const asked = await settled(resendConfirmationCode(email));
    setSending(false);
    if (!asked.ok) {
      failed(asked.error);
      return;
    }
    setResent(true);
    startWaiting();
    announce(resentWords(email, signedUp));
  }

  if (unfinished) {
    return (
      <Screen scroll avoidKeyboard style={styles.screen}>
        <HoldBack holding={isSettingPassword} />
        <StageHeading title="Almost there" intro={askForPassword ? RESUMED : UNFINISHED} />
        <View style={styles.form}>
          {askForPassword ? (
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              error={passwordError}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={confirm}
            />
          ) : null}
          {formError ? (
            <Text variant="caption" tone="danger">
              {formError}
            </Text>
          ) : null}
          <Button
            label={askForPassword ? 'Finish' : 'Try again'}
            loading={busy}
            disabled={removing}
            onPress={confirm}
          />
          <Button
            label="Start over"
            variant="ghost"
            loading={removing}
            disabled={busy}
            onPress={startOver}
          />
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
          disabled={waiting || held}
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
              disabled={held}
              onPress={() => router.replace('/sign-in')}
            />
            <Button label="Change the address" variant="ghost" disabled={held} onPress={onBack} />
            {/* A mistyped address has an account now, with the username, until
                the tidy-up deletes a sign-up that was never confirmed. */}
            <Text variant="caption" tone="muted" style={styles.note}>
              Wrong address? Go back and correct it. You may need another username then: the one you
              chose can stay with this address for about a week.
            </Text>
          </>
        ) : (
          <Button label="Back" variant="ghost" disabled={held} onPress={onBack} />
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
