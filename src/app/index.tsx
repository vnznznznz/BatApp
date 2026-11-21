import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BatMark } from '@/components/bat-mark';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { BATS_PER_USER } from '@/constants/config';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { announce } from '@/lib/announce';
import { ACCOUNT_DELETED, farewellDue, forgetFarewell, SIGNED_OUT_ELSEWHERE } from '@/lib/farewell';
import { CONTACT_URL, openLink } from '@/lib/links';
import { REFUSALS } from '@/lib/rpc-error';

/** The promises the app makes, stated on the way in. */
const PROMISES = [
  {
    title: `${BATS_PER_USER} bats. Never more.`,
    detail: 'Each one carries a single message and cannot fly again until it comes home.',
  },
  {
    title: 'They fly the real distance.',
    detail: 'Across town, a message arrives tonight. Across a continent, it takes days.',
  },
  {
    title: 'Nothing is for sale.',
    detail: 'No purchases, no credits, no subscriptions, no advertising. Not ever.',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  // After a deletion the app lands here, as after any sign-out: this says
  // that it went through, once. So it does when the session ended because the
  // account is suspended (found in the browser), or because it was ended
  // elsewhere (found in review). Said only to someone signed out: at the
  // app's start this screen is opened while the stored session is still held,
  // shows nothing, and is gone again - and the word with it, had it been said
  // there. (Found in the browser.)
  const [farewell] = useState(farewellDue);
  const words =
    farewell === 'deleted'
      ? ACCOUNT_DELETED
      : farewell === 'suspended'
        ? REFUSALS.account_suspended
        : farewell === 'ended'
          ? SIGNED_OUT_ELSEWHERE
          : null;
  const shown = !session;
  useEffect(() => {
    if (!words || !shown) return;
    forgetFarewell();
    announce(words);
  }, [words, shown]);

  // A signed-in user is on their way to the roost - the root layout sends them -
  // so the pitch is not shown to someone who already has an account.
  if (session) return null;

  return (
    // Scrolls rather than clips: this content does not fit a smaller iPhone
    // once the reader has turned Dynamic Type up.
    <Screen center scroll style={styles.screen}>
      {words ? (
        <Card style={[styles.card, styles.farewell]}>
          <Text variant="body" center>
            {words}
          </Text>
          {farewell === 'suspended' && CONTACT_URL ? (
            <Button label="Contact" variant="ghost" onPress={() => void openLink(CONTACT_URL)} />
          ) : null}
        </Card>
      ) : null}

      <BatMark size={132} />

      <Text variant="display" style={styles.title}>
        Night Courier
      </Text>
      <Text variant="body" tone="accent" center>
        Messages that take their time.
      </Text>

      <View style={styles.rule} />

      <Card style={styles.card}>
        {PROMISES.map((promise, index) => (
          <View key={promise.title} style={[styles.promise, index > 0 && styles.promiseDivided]}>
            <Text variant="heading">{promise.title}</Text>
            <Text variant="caption" tone="secondary" style={styles.detail}>
              {promise.detail}
            </Text>
          </View>
        ))}
      </Card>

      <View style={styles.actions}>
        <Button label="Create an account" onPress={() => router.push('/sign-up')} />
        <Button
          label="I already have one"
          variant="ghost"
          onPress={() => router.push('/sign-in')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingVertical: Spacing.xl,
  },
  title: {
    marginTop: Spacing.md,
  },
  rule: {
    width: 48,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderStrong,
    marginVertical: Spacing.lg,
  },
  card: {
    alignSelf: 'stretch',
  },
  farewell: {
    gap: Spacing.sm,
  },
  promise: {
    gap: Spacing.xs,
  },
  promiseDivided: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  detail: {
    // Keeps the second line from crowding the heading above it.
    lineHeight: 19,
  },
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
});
