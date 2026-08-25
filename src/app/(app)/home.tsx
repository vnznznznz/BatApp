import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { BatMark } from '@/components/bat-mark';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { BATS_PER_USER } from '@/constants/config';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { describeCity } from '@/features/cities/search';
import { useProfile } from '@/features/profile/use-profile';

/**
 * A placeholder home. The roost, the flock and the inbox arrive in later
 * phases; what is real here is the session, the profile, and being able to sign
 * out or delete the account.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { signOut, deleteAccount } = useAuth();
  const { profile, isLoading, reload } = useProfile();
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

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
        <BatMark size={88} />
        {isLoading && !profile ? (
          <ActivityIndicator color={Colors.textMuted} />
        ) : (
          <>
            <Text variant="title" center>
              {profile?.displayName ?? 'Courier'}
            </Text>
            <Text variant="caption" tone="secondary" center>
              @{profile?.username}
              {profile?.city ? ` · ${describeCity(profile.city)}` : ''}
            </Text>
          </>
        )}
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

      {profile && !profile.city ? (
        <Card raised style={styles.card}>
          <Text variant="heading">Choose your city</Text>
          <Text variant="caption" tone="secondary" style={styles.note}>
            Your bats have nowhere to fly from until they know where home is.
          </Text>
          <Button label="Choose your city" onPress={() => router.push('/city-picker')} />
        </Card>
      ) : null}

      <View style={styles.actions}>
        <Button label="Your profile" variant="secondary" onPress={() => router.push('/profile')} />
        <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
        <Button label="Delete my account" variant="danger" loading={busy} onPress={confirmDelete} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingVertical: Spacing.xl },
  header: { alignItems: 'center', gap: Spacing.sm },
  card: { marginTop: Spacing.lg, gap: Spacing.sm },
  note: { lineHeight: 19 },
  actions: { gap: Spacing.sm, marginTop: Spacing.xl },
});
