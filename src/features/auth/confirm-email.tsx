import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
  FINISHING_SIGN_OUT,
  SignedOutUnfinished,
  useAuth,
  type SignUpDetails,
} from '@/features/auth/auth-context';
import { HoldBack } from '@/features/auth/hold-back';
import { settled, wordsOf } from '@/features/auth/settled';
import { StageHeading, stageWords } from '@/features/auth/stage-heading';
import { useResendWait } from '@/features/auth/use-resend-wait';
import { EMAIL_CODE_LENGTH, validateEmailCode, validatePassword } from '@/features/auth/validation';
import { announce } from '@/lib/announce';
import { useLingering } from '@/lib/use-lingering';

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
       * is still waiting for its code - with that password, to set again once
       * the code has confirmed the address: confirming it takes the account's
       * password away.
       */
      reason: 'not-confirmed';
      password: string;
      /**
       * The code has signed the courier in already, on an earlier visit to
       * this screen, and the password is still to be saved again. It was
       * never kept: it is asked for.
       */
      resumed?: boolean;
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
const SIGN_OUT_INSTEAD = 'Or sign out, and set a password with "I forgot my password".';
const NOT_SAVED =
  'Your address is confirmed, but your password is not saved yet: confirming the address ' +
  `takes it away until it is saved again. Try again. ${SIGN_OUT_INSTEAD}`;
const NOT_SAVED_RESUMED =
  'Your address is confirmed, but your password is not saved yet: confirming the address ' +
  `takes it away until it is saved again. Type it - the one you signed in with, or a new one. ${SIGN_OUT_INSTEAD}`;
const SIGNED_OUT = 'Signed out. To sign in, set a password with "I forgot my password".';

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
  const resumed = props.resumed === true;
  const signedUp = details !== null;
  // The password typed on the form the courier came from; none when the
  // screen was opened again to finish (`resumed`), and it is asked for here.
  const typedBefore = props.reason === 'signed-up' ? props.details.password : props.password;
  const router = useRouter();
  const {
    isSettingPassword,
    isSigningOut,
    confirmEmail,
    confirmSignUp,
    finishSignUp,
    finishSignIn,
    removeUnfinishedAccount,
    resendConfirmationCode,
    signOut,
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
  // Starting over, or signing out, from the stage that asks to try again.
  const [leaving, setLeaving] = useState(false);
  // The code was right, and signed the courier in, but the account could not
  // be set up as they set it up, or the password signed in with not saved
  // again: that alone is still to be done, for as long as the code's sign-in
  // holds.
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
  const held = busy || leaving || isSettingPassword;
  // The password the account is to be given: as typed before, or here.
  const askForPassword = !typedBefore;
  const chosenPassword = typedBefore || password;
  const chosen = details ? { ...details, password: chosenPassword } : null;
  // The code is checked only once no sign-out is under way, as signing in
  // is, and on a connection that never answers that is a minute behind
  // Confirm's spinner: said, once it has taken a while, under the button and
  // aloud, as under Sign in and Create account. The stage that asks to try
  // again checks no code.
  const finishingSignOut = useLingering(busy && isSigningOut && !unfinished);
  useEffect(() => {
    if (finishingSignOut) announce(FINISHING_SIGN_OUT);
  }, [finishingSignOut]);

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

  /** The code, unless it has signed the courier in already, and then the password. */
  async function confirmThenFinish() {
    if (!unfinished) {
      // A code to check: whatever was left unfinished before was signed out
      // of, and this one starts afresh.
      setNotFinished(false);
      // Signed in, and held by the root layout (src/app/_layout.tsx) until
      // what follows is done.
      const checked = await settled(
        chosen ? confirmSignUp(chosen, code) : confirmEmail(email, code),
      );
      if (!checked.ok) {
        failed(checked.error, { atTheCode: true });
        return;
      }
    }
    await finish(chosen);
  }

  /** The account set up as typed at sign-up; from signing in, the password saved again. */
  async function finish(account: SignUpDetails | null) {
    const done = await settled(
      account ? finishSignUp(account) : finishSignIn(chosenPassword).then(() => 'signed in'),
    );
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
    if (done.error instanceof SignedOutUnfinished) {
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
    announce(
      `${stageWords('Almost there', signedUp ? UNFINISHED : NOT_SAVED)} ${wordsOf(done.error)}`,
    );
  }

  async function startOver() {
    if (inFlight.current) return;
    inFlight.current = true;
    setFormError(null);
    setLeaving(true);
    const removed = await settled(removeUnfinishedAccount());
    inFlight.current = false;
    setLeaving(false);
    if (!removed.ok) {
      failed(removed.error);
      return;
    }
    // Signed out, the account gone: back to the form, with what was typed.
    announce(STARTED_OVER);
    onBack();
  }

  /**
   * From signing in: the account is the courier's, confirmed now, and left
   * without a password until one is set - with a reset's code, which proves
   * the address theirs as this one did.
   */
  async function signOutInstead() {
    if (inFlight.current) return;
    inFlight.current = true;
    setFormError(null);
    setLeaving(true);
    const left = await settled(signOut());
    inFlight.current = false;
    setLeaving(false);
    if (!left.ok) {
      failed(left.error);
      return;
    }
    announce(SIGNED_OUT);
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
        <StageHeading
          title="Almost there"
          intro={
            signedUp
              ? askForPassword
                ? RESUMED
                : UNFINISHED
              : askForPassword
                ? NOT_SAVED_RESUMED
                : NOT_SAVED
          }
        />
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
            disabled={leaving}
            onPress={confirm}
          />
          <Button
            label={signedUp ? 'Start over' : 'Sign out'}
            variant="ghost"
            loading={leaving}
            disabled={busy}
            onPress={signedUp ? startOver : signOutInstead}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll avoidKeyboard style={styles.screen}>
      {/* The code goes, or has signed the courier in: on until the account is theirs,
          or the password signed in with saved again. */}
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
        {finishingSignOut ? (
          <Text variant="caption" tone="muted" center>
            {FINISHING_SIGN_OUT}
          </Text>
        ) : null}

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
