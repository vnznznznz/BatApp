import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/badge';
import { BatMark } from '@/components/bat-mark';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { BATS_PER_USER } from '@/constants/config';
import { Colors, Spacing } from '@/constants/theme';
import { describeCity } from '@/features/cities/search';
import { fetchBadges } from '@/features/messages/messages';
import { useProfile } from '@/features/profile/use-profile';
import { BatTile } from '@/features/roost/bat-tile';
import { countAtHome, fetchRoost, nextHomecoming } from '@/features/roost/roost';
import { formatDuration } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { useRefreshAt } from '@/lib/use-refresh-at';
import { useRemote } from '@/lib/use-remote';
import { useScreenFocused } from '@/lib/use-screen-focused';

/**
 * The roost: the courier's three bats, and the way to everything else.
 *
 * Every figure on this screen is the server's. The bat count is read from the
 * bats themselves rather than from the constant, and each countdown runs toward
 * an arrival time the server set when the letter left.
 */
export default function HomeScreen() {
  const router = useRouter();
  const {
    profile,
    isLoading: profileLoading,
    error: profileError,
    reload: reloadProfile,
  } = useProfile();
  const roost = useRemote(fetchRoost);
  const badges = useRemote(fetchBadges);
  const now = useNow(1000);
  // The roost stays mounted under every other screen; its bats rest meanwhile.
  const focused = useScreenFocused();

  const { reload: reloadRoost, refresh: refreshRoost } = roost;
  const { reload: reloadBadges } = badges;

  // The profile screen and the city picker change what this one shows.
  useFocusEffect(
    useCallback(() => {
      void reloadProfile();
    }, [reloadProfile]),
  );

  const bats = roost.data ?? [];
  const atHome = countAtHome(bats);
  const nextHomeAt = nextHomecoming(bats)?.getTime() ?? null;

  // Fetch again the moment the next bat is due, and keep asking while it is
  // overdue, so it lands on screen without anyone pulling to refresh.
  const reloadAll = useCallback(() => {
    void reloadRoost();
    void reloadBadges();
  }, [reloadRoost, reloadBadges]);
  useRefreshAt(nextHomeAt, roost.settledAt, reloadAll);

  const hasCity = Boolean(profile?.city);
  const canWrite = hasCity && atHome > 0;

  let writeHint: string | null = null;
  if (profile && !hasCity) {
    writeHint = 'Choose your city before sending a letter.';
  } else if (roost.data && atHome === 0 && nextHomeAt !== null) {
    const remaining = nextHomeAt - now;
    writeHint =
      remaining > 0
        ? `All ${BATS_PER_USER} bats are out. The next one is home in ${formatDuration(remaining)}.`
        : `All ${BATS_PER_USER} bats are out. The next one is landing any moment now.`;
  }

  const unread = badges.data?.unreadLetters ?? 0;
  const requests = badges.data?.friendRequests ?? 0;

  const refreshAll = () => {
    void refreshRoost();
    void reloadBadges();
    void reloadProfile();
  };

  return (
    <Screen
      scroll
      style={styles.screen}
      refreshControl={
        <RefreshControl
          refreshing={roost.isRefreshing}
          onRefresh={refreshAll}
          tintColor={Colors.textMuted}
        />
      }
    >
      <View style={styles.header}>
        <BatMark size={72} />
        {profile ? (
          <>
            <Text variant="title" center>
              {profile.displayName}
            </Text>
            <Text variant="caption" tone="secondary" center>
              @{profile.username}
              {profile.city ? ` · ${describeCity(profile.city)}` : ''}
            </Text>
          </>
        ) : profileLoading ? (
          <ActivityIndicator color={Colors.textMuted} />
        ) : (
          // Without this, a failed load rendered a placeholder name over a bare "@".
          <Text variant="caption" tone="danger" center>
            {profileError ?? 'Your profile could not be loaded. Pull down to try again.'}
          </Text>
        )}
      </View>

      {profile && !hasCity ? (
        <Card raised style={styles.card}>
          <Text variant="heading">Choose your city</Text>
          <Text variant="caption" tone="secondary" style={styles.note}>
            Your bats have nowhere to fly from until they know where home is.
          </Text>
          <Button label="Choose your city" onPress={() => router.push('/city-picker')} />
        </Card>
      ) : null}

      <Card style={styles.card}>
        <View style={styles.roostHeading}>
          <Text variant="heading">Your roost</Text>
          {roost.data ? (
            <Text variant="caption" tone="secondary">
              {atHome} of {bats.length} at home
            </Text>
          ) : null}
        </View>

        {roost.data ? (
          <View style={styles.tiles}>
            {bats.map((bat) => (
              <BatTile
                key={bat.id}
                bat={bat}
                now={now}
                active={focused}
                onPress={
                  bat.flight
                    ? () =>
                        router.push({
                          pathname: '/letters/[id]',
                          params: { id: bat.flight!.messageId },
                        })
                    : canWrite
                      ? () => router.push('/compose')
                      : undefined
                }
              />
            ))}
          </View>
        ) : roost.error ? null : (
          <ActivityIndicator color={Colors.textMuted} style={styles.loading} />
        )}

        {roost.error ? (
          <Text variant="caption" tone="danger">
            {roost.error}
          </Text>
        ) : null}
      </Card>

      <View style={styles.write}>
        <Button
          label="Write a letter"
          disabled={!canWrite}
          onPress={() => router.push('/compose')}
        />
        {writeHint ? (
          <Text variant="caption" tone="muted" center style={styles.note}>
            {writeHint}
          </Text>
        ) : null}
      </View>

      <Card style={[styles.card, styles.menu]}>
        <ListRow
          title="Letters"
          subtitle={unread > 0 ? `${unread} new` : 'Received and sent'}
          emphasised={unread > 0}
          trailing={
            <>
              <Badge count={unread} label="unread letters" />
              <Chevron />
            </>
          }
          onPress={() => router.push('/letters')}
        />
        <ListRow
          title="Friends"
          subtitle={
            requests > 0 ? `${requests} waiting for your answer` : 'Add friends by their username'
          }
          emphasised={requests > 0}
          trailing={
            <>
              <Badge count={requests} label="friend requests" />
              <Chevron />
            </>
          }
          onPress={() => router.push('/friends')}
        />
        <ListRow
          title="Your profile"
          subtitle="Name, city and account"
          trailing={<Chevron />}
          onPress={() => router.push('/profile')}
        />
      </Card>
    </Screen>
  );
}

function Chevron() {
  return (
    <Text variant="heading" tone="muted" accessibilityElementsHidden importantForAccessibility="no">
      ›
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { paddingVertical: Spacing.xl },
  header: { alignItems: 'center', gap: Spacing.sm },
  card: { marginTop: Spacing.lg, gap: Spacing.sm },
  menu: { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.xs, gap: 0 },
  note: { lineHeight: 19 },
  roostHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  tiles: { flexDirection: 'row', gap: Spacing.sm },
  loading: { paddingVertical: Spacing.xl },
  write: { marginTop: Spacing.lg, gap: Spacing.sm },
});
