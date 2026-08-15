import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BATS_PER_USER } from '@/constants/config';
import { Colors, FontSize, Fonts, Spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Image
          source={require('@/assets/images/splash-icon.png')}
          style={styles.mark}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="A bat in flight"
        />

        <Text style={styles.title}>Night Courier</Text>
        <Text style={styles.tagline}>Messages that take their time.</Text>

        <View style={styles.rule} />

        <Text style={styles.body}>
          You keep {BATS_PER_USER} bats. Each one carries a single message, flies the real distance
          between your city and your friend&apos;s, and cannot be sent again until it comes home.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  mark: {
    width: 168,
    height: 168,
  },
  title: {
    color: Colors.text,
    fontFamily: Fonts?.serif,
    fontSize: FontSize.display,
    letterSpacing: 0.5,
  },
  tagline: {
    color: Colors.accent,
    fontSize: FontSize.body,
    letterSpacing: 0.3,
  },
  rule: {
    width: 56,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  body: {
    color: Colors.textSecondary,
    fontSize: FontSize.body,
    lineHeight: 24,
    textAlign: 'center',
  },
});
