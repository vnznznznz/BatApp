import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BatMark } from '@/components/bat-mark';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { BATS_PER_USER } from '@/constants/config';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';

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

  if (session) return <Redirect href="/home" />;

  return (
    // Scrolls rather than clips: this content does not fit a smaller iPhone
    // once the reader has turned Dynamic Type up.
    <Screen center scroll style={styles.screen}>
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
