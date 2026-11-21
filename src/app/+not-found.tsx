import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';

/**
 * Where a link that leads nowhere in the app lands: an old one, or one typed
 * wrong. Without it, Expo Router showed a page of its own, with a link to its
 * sitemap - a developer's tool, not a way on.
 */
export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen center scroll style={styles.screen}>
      <Text variant="title" center>
        Nothing here
      </Text>
      <Text variant="body" tone="secondary" center style={styles.body}>
        This link does not lead anywhere in Night Courier. It may be old, or mistyped.
      </Text>
      {/* Back to the start if it is underneath, or in this page's place if
          the link opened the app. Signed in, the start sends the courier on
          to the roost. */}
      <Button label="Back to the start" onPress={() => router.dismissTo('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingVertical: Spacing.xl },
  body: { marginVertical: Spacing.lg },
});
