import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { ToggleRow } from '@/components/toggle-row';
import { BATS_PER_USER, MINIMUM_AGE, PARENTAL_PERMISSION_UNDER } from '@/constants/config';
import { Spacing } from '@/constants/theme';
import { ALREADY_REGISTERED, USERNAME_MAY_BE_TAKEN, useAuth } from '@/features/auth/auth-context';
import { ConfirmEmail } from '@/features/auth/confirm-email';
import { HoldBack } from '@/features/auth/hold-back';
import { settled, wordsOf } from '@/features/auth/settled';
import {
  validateDisplayName,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@/features/auth/validation';
import { announce } from '@/lib/announce';
import { openLink, PRIVACY_POLICY_URL } from '@/lib/links';

type Errors = Partial<Record<'email' | 'password' | 'username' | 'displayName', string | null>>;

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, unfinished } = useAuth();
  // A sign-up whose code has signed the courier in, with the account not yet
  // set up - the app closed in between, say - taken up where it was left: the
  // root layout brings the courier here for it.
  const [resumed] = useState(() => (unfinished?.flow === 'sign-up' ? unfinished : null));

  const [displayName, setDisplayName] = useState(resumed?.displayName ?? '');
  const [username, setUsername] = useState(resumed?.username ?? '');
  const [email, setEmail] = useState(resumed?.email ?? '');
  const [password, setPassword] = useState('');
  const [oldEnough, setOldEnough] = useState(false);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(resumed?.email ?? null);
  // Until the courier goes back to the form from it.
  const [resuming, setResuming] = useState(resumed !== null);
  const [busy, setBusy] = useState(false);
  // The fields the keyboard's "next" key moves on to, in order.
  const usernameField = useRef<TextInput>(null);
  const emailField = useRef<TextInput>(null);
  const passwordField = useRef<TextInput>(null);
  // The keyboard's "go" key is not held back by the button's spinner, and a
  // second tap can come before the spinner is drawn: once is enough.
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;
    const next: Errors = {
      displayName: validateDisplayName(displayName),
      username: validateUsername(username),
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(next);
    setFormError(null);
    // Asked, not checked: nobody's age is known or stored. But the rule is
    // said where it applies, and agreeing to it is a deliberate act. Said aloud
    // whatever else is wrong - the fields say their own errors - so a screen
    // reader user does not learn of it only on a second try. (Found in review.)
    const tooYoung = oldEnough ? null : AGE_RULE;
    setAgeError(tooYoung);
    if (tooYoung) announce(tooYoung);
    if (Object.values(next).some(Boolean) || tooYoung) return;

    inFlight.current = true;
    setBusy(true);
    const answer = await settled(signUp({ email, password, username, displayName }));
    inFlight.current = false;
    setBusy(false);

    if (!answer.ok) {
      const message = wordsOf(answer.error);
      // The failures that belong to a field are said at that field.
      // The fields say theirs aloud; the form says its own.
      if (message === USERNAME_MAY_BE_TAKEN) setErrors({ ...next, username: message });
      else if (message === ALREADY_REGISTERED) setErrors({ ...next, email: message });
      else {
        setFormError(message);
        announce(message);
      }
      return;
    }
    // With confirmation on, no session arrives yet: the code emailed to the
    // address is asked for. With it off, the session lands immediately and
    // the route guard takes them onward, so asking for a code would be a lie
    // they would wait on.
    if (answer.value.needsEmailConfirmation) setSentTo(email.trim());
  }

  if (sentTo) {
    // Back from there to this form, with everything typed still in it, for an
    // address that was mistyped.
    return (
      <ConfirmEmail
        email={sentTo}
        reason="signed-up"
        details={{ email, password, username, displayName }}
        resumed={resuming}
        onBack={() => {
          setResuming(false);
          setSentTo(null);
        }}
      />
    );
  }

  return (
    <Screen scroll avoidKeyboard style={styles.screen}>
      {/* Nothing is held on the form. Said here too: the code screen's swipe, taken
          away while it held the way in, is not given back by its going - and
          starting over comes back to the form in the same moment as the hold ends. */}
      <HoldBack holding={false} />
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
          hint="What your friends, and anyone you ask to be friends, will see."
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="next"
          // On without letting go of the focus first, which would close the
          // keyboard for the next field to open it again.
          submitBehavior="submit"
          onSubmitEditing={() => usernameField.current?.focus()}
        />
        <TextField
          ref={usernameField}
          label="Username"
          value={username}
          onChangeText={setUsername}
          error={errors.username}
          hint="How friends find you. Lowercase letters, numbers and underscores."
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailField.current?.focus()}
        />
        <TextField
          ref={emailField}
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
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

        {/* Only while the server confirms nothing by email: then an address
            with an account is said to have one (see signUp). */}
        {errors.email === ALREADY_REGISTERED ? (
          <Button
            label="Sign in instead"
            variant="secondary"
            onPress={() => router.replace('/sign-in')}
          />
        ) : null}

        <ToggleRow
          label={`I am ${MINIMUM_AGE} or older`}
          hint={`If you are under ${PARENTAL_PERMISSION_UNDER}, a parent or guardian has said yes.`}
          value={oldEnough}
          onValueChange={(value) => {
            setOldEnough(value);
            setAgeError(null);
          }}
          error={ageError}
        />

        {/* The terms come before the button that agrees to them. */}
        <Text variant="caption" tone="secondary" style={styles.rules}>
          By creating an account, you agree to the house rules - the terms of using Night Courier.
          There is no tolerance for harassment, threats, hate, scams, spam, or sexual content nobody
          asked for, and none at all for sexual content involving or sent to anyone under 18.
          Accounts that break them may be removed.
        </Text>
        <Button
          label="Read the house rules"
          variant="ghost"
          onPress={() => router.push('/rules')}
        />
        {PRIVACY_POLICY_URL ? (
          <Button
            label="Privacy policy"
            variant="ghost"
            onPress={() => void openLink(PRIVACY_POLICY_URL)}
          />
        ) : null}
        <Button label="Create account" loading={busy} onPress={submit} />
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const AGE_RULE =
  `Turn on "I am ${MINIMUM_AGE} or older" to continue. Night Courier is for people aged ` +
  `${MINIMUM_AGE} and over - under ${PARENTAL_PERMISSION_UNDER}, with a parent's or ` +
  `guardian's permission.`;

const styles = StyleSheet.create({
  screen: { paddingVertical: Spacing.xl },
  subtitle: { marginTop: Spacing.xs },
  form: { gap: Spacing.md, marginTop: Spacing.xl },
  rules: { lineHeight: 19 },
});
