import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { validateDisplayName } from '@/features/auth/validation';
import { describeCity } from '@/features/cities/search';
import { useProfile } from '@/features/profile/use-profile';
import { confirmAction, notify } from '@/lib/confirm';
import { formatTimestamp } from '@/lib/format';

export default function ProfileScreen() {
  const router = useRouter();
  const { signOut, deleteAccount } = useAuth();
  const { profile, isLoading, error, reload, updateDisplayName } = useProfile();
  const [deleting, setDeleting] = useState(false);

  /**
   * Null until the user types, so the field shows whatever the profile last
   * loaded without an effect copying one piece of state into another. Reset to
   * null after a successful save, which lets the reloaded profile take over
   * again.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const displayName = draft ?? profile?.displayName ?? '';

  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // The city picker writes the change itself and pops back here, so this screen
  // has to re-read rather than trust what it loaded on mount.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function save() {
    const problem = validateDisplayName(displayName);
    setNameError(problem);
    setSaveError(null);
    setSaved(false);
    if (problem) return;

    setBusy(true);
    try {
      await updateDisplayName(displayName);
      setDraft(null);
      setSaved(true);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'That could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    confirmAction({
      title: 'Delete your account?',
      message:
        'Your profile, your bats, your friendships and every letter you have sent or received ' +
        'are removed permanently. Letters you sent disappear from your friends’ inboxes too. ' +
        'This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep my account',
      destructive: true,
      onConfirm: async () => {
        setDeleting(true);
        try {
          await deleteAccount();
        } catch (caught) {
          notify(
            'Could not delete',
            caught instanceof Error ? caught.message : 'Please try again.',
          );
        } finally {
          setDeleting(false);
        }
      },
    });
  }

  if (isLoading && !profile) {
    return (
      <Screen center edges={['bottom']}>
        <ActivityIndicator color={Colors.textMuted} />
      </Screen>
    );
  }

  return (
    <Screen scroll style={styles.screen} edges={['bottom']}>
      <Text variant="title">Your profile</Text>

      {error ? (
        <Text variant="caption" tone="danger" style={styles.spaced}>
          {error}
        </Text>
      ) : null}

      {/* Without a profile there is nothing true to show here - not an empty
          username, and not "no city chosen" for a courier who has one. What
          stays is the way out: the error above may say to sign out and in. */}
      {profile ? (
        <>
          <Card style={styles.card}>
            <Text variant="caption" tone="secondary">
              Username
            </Text>
            <Text variant="body">@{profile.username}</Text>
            <Text variant="caption" tone="muted">
              How friends find you. It cannot be changed.
            </Text>
          </Card>

          <View style={styles.form}>
            <TextField
              label="Your name"
              value={displayName}
              onChangeText={(value) => {
                setDraft(value);
                setSaved(false);
              }}
              error={nameError}
              hint="What your friends see."
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={save}
            />

            {saveError ? (
              <Text variant="caption" tone="danger">
                {saveError}
              </Text>
            ) : null}
            {saved ? (
              <Text variant="caption" tone="available">
                Saved.
              </Text>
            ) : null}

            <Button label="Save name" loading={busy} onPress={save} />
          </View>

          <View style={styles.form}>
            <Text variant="caption" tone="secondary">
              Your city
            </Text>
            <Text variant="body">
              {profile.city ? describeCity(profile.city) : 'Not chosen yet'}
            </Text>
            <Text variant="caption" tone="muted" style={styles.hint}>
              {profile.move
                ? `Your bats are still settling in. Until ${formatTimestamp(profile.move.settlesAt)}, letters leave from ${describeCity(profile.move.from)}.`
                : profile.city
                  ? 'Distance from here decides how long your bats fly.'
                  : 'Your bats cannot fly anywhere until you pick a city.'}
            </Text>
            <Button
              label={profile.city ? 'Change city' : 'Choose your city'}
              variant={profile.city ? 'secondary' : 'primary'}
              onPress={() => router.push('/city-picker')}
            />
          </View>
        </>
      ) : null}

      <View style={[styles.form, styles.account]}>
        <Text variant="caption" tone="secondary">
          Account
        </Text>
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
        <Button
          label="Delete my account"
          variant="danger"
          loading={deleting}
          onPress={confirmDelete}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  card: { marginTop: Spacing.lg, gap: Spacing.xs },
  account: {
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  form: { gap: Spacing.sm, marginTop: Spacing.xl },
  spaced: { marginTop: Spacing.sm },
  hint: { lineHeight: 19 },
});
