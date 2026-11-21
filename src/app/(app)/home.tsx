import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
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
import { AccountClosedActions } from '@/features/profile/account-closed';
import { useProfile } from '@/features/profile/use-profile';
import { BatTile } from '@/features/roost/bat-tile';
import { countAtHome, fetchRoost, nextHomecoming, onRoostChanged } from '@/features/roost/roost';
import { formatDuration, formatTimestamp } from '@/lib/format';
import { STILL_TRYING, useLingering } from '@/lib/use-lingering';
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
  // The profile screen and the city picker change what this one shows: the
  // hook reads the profile again by itself each time the roost comes back into
  // view. This screen asking as well made two requests for the same row at
  // every return. (Found in the merged tree.)
  const { profile, error: profileError, isGone, reload: reloadProfile } = useProfile();
  const roost = useRemote(fetchRoost);
  const badges = useRemote(fetchBadges);
  const now = useNow(1000);
  // The roost stays mounted under every other screen; its bats rest meanwhile.
  const focused = useScreenFocused();

  const { reload: reloadRoost, refresh: refreshRoost } = roost;
  const { reload: reloadBadges } = badges;

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

  // And when a send settles. Its own screen may be gone by then, with this one
  // in front again: it asked as it came into view, a moment before the letter
  // was stored, and would go on showing that bat at home.
  useEffect(() => onRoostChanged(reloadAll), [reloadAll]);

  // Only a courier known to have no city is kept from writing. One whose
  // profile could not be loaded is not: the server knows where home is, and
  // refuses a sender without a city itself. (Found in review: a profile that
  // failed once left "Write a letter" disabled under bats that were all home.)
  const needsCity = profile !== null && !profile.city;
  // An account that is gone can send nothing, whatever the bats last looked
  // like, and asking again changes nothing: what is left is the way out.
  // (Found in the merged tree.) Nor can a suspended one, which the server
  // refuses everything - its bats and counts included. (Found in the browser.)
  const suspended = roost.reason === 'account_suspended' || badges.reason === 'account_suspended';
  const closed = isGone || suspended;
  const canWrite = atHome > 0 && !needsCity && !closed && Boolean(profile || profileError);

  // A new city takes a day to count, and until then the bats still leave from
  // the old one. Read against this screen's own clock: the roost stays open
  // under every other screen, and a move that has settled must not go on being
  // announced until the profile happens to be read again.
  const move = profile?.move && profile.move.settlesAt.getTime() > now ? profile.move : null;

  let writeHint: string | null = null;
  if (needsCity) {
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
  // Never counted, which is not the same as nothing waiting.
  const uncounted = Boolean(badges.error) && !badges.data;

  // Everything on this screen, asked for again: by a pull, and by "Try again".
  const refreshAll = () => {
    void refreshRoost();
    void reloadBadges();
    void reloadProfile();
  };

  // Shown where there is nothing to show instead. The screen asks again by
  // itself as well, but an error that says "try again" has to come with a way
  // to do it. One button, wherever the bats would be, or else the name: with
  // no connection everything fails at once.
  const roostMissing = Boolean(roost.error) && !roost.data;
  // A first load can take half a minute to fail without a network: the
  // spinner says, after a few seconds, what it is waiting for.
  const stillTrying = useLingering(!roost.data && !roost.error);
  const tryAgain = (
    <Button
      label="Try again"
      variant="secondary"
      loading={roost.isRefreshing}
      onPress={refreshAll}
    />
  );

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
            {/* The line above names the new city; the profile and the compose
                screen say the same of a move. (Found in review.) */}
            {move ? (
              <Text variant="caption" tone="muted" center style={styles.note}>
                Your bats still leave from {describeCity(move.from)} until{' '}
                {formatTimestamp(move.settlesAt, new Date(now))}, when your move settles.
              </Text>
            ) : null}
          </>
        ) : profileError ? (
          // Without this, a failed load rendered a placeholder name over a bare "@".
          <>
            <Text variant="caption" tone="danger" center>
              {profileError}
            </Text>
            {isGone ? <AccountClosedActions /> : roostMissing ? null : tryAgain}
          </>
        ) : (
          <ActivityIndicator color={Colors.textMuted} />
        )}
      </View>

      {needsCity ? (
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
          <View style={styles.loading}>
            <ActivityIndicator color={Colors.textMuted} />
            {stillTrying ? (
              <Text variant="caption" tone="muted" center>
                {STILL_TRYING}
              </Text>
            ) : null}
          </View>
        )}

        {roost.error ? (
          <Text variant="caption" tone="danger">
            {roost.error}
          </Text>
        ) : suspended ? (
          <Text variant="caption" tone="danger">
            {badges.error}
          </Text>
        ) : null}
        {suspended && !isGone ? <AccountClosedActions /> : null}
        {roostMissing && !closed ? tryAgain : null}
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
          subtitle={
            unread > 0
              ? `${unread} new`
              : uncounted
                ? 'Could not check for new letters'
                : 'Received and sent'
          }
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
            requests > 0
              ? `${requests} waiting for your answer`
              : uncounted
                ? 'Could not check for friend requests'
                : 'Add friends by their username'
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
  loading: { paddingVertical: Spacing.xl, gap: Spacing.sm },
  write: { marginTop: Spacing.lg, gap: Spacing.sm },
});
