import { StyleSheet, View } from 'react-native';

import { BatMark } from '@/components/bat-mark';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { BATS_PER_USER } from '@/constants/config';
import { Colors, Spacing } from '@/constants/theme';

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
  return (
    <Screen center>
      <BatMark size={148} />

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
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
