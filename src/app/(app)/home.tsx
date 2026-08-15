import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { BatMark } from '@/components/bat-mark';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { BATS_PER_USER } from '@/constants/config';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';

/**
 * A placeholder home. The roost, the flock and the inbox arrive in later
 * phases; what is real here is that a session exists and that the account can
 * be signed out of and deleted.
 */
export default function HomeScreen() {
  const { session, signOut, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'Your profile and everything attached to it are removed permanently. This cannot be undone.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteAccount();
            } catch (error) {
              Alert.alert(
                'Could not delete',
                error instanceof Error ? error.message : 'Please try again.',
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Screen scroll style={styles.screen}>
      <View style={styles.header}>
        <BatMark size={96} />
        <Text variant="title" center>
          Signed in
        </Text>
        <Text variant="caption" tone="secondary" center>
          {session?.user.email}
        </Text>
      </View>

      <Card style={styles.card}>
        <Text variant="heading">
          🦇 {BATS_PER_USER} / {BATS_PER_USER} bats available
        </Text>
        <Text variant="caption" tone="secondary" style={styles.note}>
          Your roost is not wired up yet — this figure is the promise, not a reading. Bats become
          real records in Phase 4, and start flying in Phase 7.
        </Text>
      </Card>

      <View style={styles.actions}>
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
        <Button label="Delete my account" variant="danger" loading={busy} onPress={confirmDelete} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingVertical: Spacing.xl },
  header: { alignItems: 'center', gap: Spacing.sm },
  card: { marginTop: Spacing.xl, gap: Spacing.xs },
  note: { lineHeight: 19 },
  actions: { gap: Spacing.sm, marginTop: Spacing.xl },
});
