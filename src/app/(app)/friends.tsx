import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Colors, Spacing } from '@/constants/theme';
import { validateUsername } from '@/features/auth/validation';
import { describeCity } from '@/features/cities/search';
import {
  acceptFriend,
  describeRequestOutcome,
  fetchFriendships,
  friendName,
  groupFriendships,
  removeFriend,
  requestFriend,
  type Friendship,
} from '@/features/friends/friends';
import { useProfile } from '@/features/profile/use-profile';
import { announce } from '@/lib/announce';
import { confirmAction } from '@/lib/confirm';
import { formatFlightEstimate, formatTimestamp } from '@/lib/format';
import { messageOf } from '@/lib/rpc-error';
import { useRemote } from '@/lib/use-remote';

/**
 * Friends: asking someone by username, answering those who asked, and parting.
 *
 * Only friends can exchange letters, and a friendship takes both people. What
 * this screen shows about someone is exactly what the server decided they have
 * agreed to share: a person you have asked shows only their username until
 * they accept.
 */
export default function FriendsScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const list = useRemote(fetchFriendships);
  const { reload, refresh } = list;

  const [username, setUsername] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  /**
   * The friendship an action is running on, and which action - so the button
   * that was pressed shows progress, and declining never looks like accepting.
   */
  const [busy, setBusy] = useState<{ id: string; action: FriendAction } | null>(null);
  const busyId = busy?.id ?? null;
  const [actionError, setActionError] = useState<string | null>(null);

  const groups = groupFriendships(list.data ?? []);

  async function ask() {
    const problem = validateUsername(username);
    setFieldError(problem);
    setOutcome(null);
    if (problem) return;

    setAsking(true);
    try {
      const result = await requestFriend(username);
      const said = describeRequestOutcome(result, username);
      setOutcome(said);
      announce(said);
      setUsername('');
      await reload();
    } catch (caught) {
      setFieldError(messageOf(caught));
    } finally {
      setAsking(false);
    }
  }

  async function act(friendship: Friendship, action: FriendAction) {
    setBusy({ id: friendship.id, action });
    setActionError(null);
    try {
      await action(friendship.id);
      await reload();
    } catch (caught) {
      const problem = messageOf(caught);
      setActionError(problem);
      announce(problem);
      // Whatever went wrong, the list on screen may be out of date now.
      await reload();
    } finally {
      setBusy(null);
    }
  }

  function confirmRemove(friendship: Friendship) {
    confirmAction({
      title: `Stop being friends with ${friendName(friendship.friend)}?`,
      message:
        'Neither of you will be able to send the other letters. Letters already in the air ' +
        'still arrive, and the letters you have exchanged stay where they are.',
      confirmLabel: 'Remove',
      cancelLabel: 'Keep',
      destructive: true,
      onConfirm: () => void act(friendship, removeFriend),
    });
  }

  function writeTo(friendship: Friendship) {
    router.push({ pathname: '/compose', params: { to: friendship.friend.id } });
  }

  return (
    <Screen
      scroll
      edges={['bottom']}
      style={styles.screen}
      refreshControl={
        <RefreshControl
          refreshing={list.isRefreshing}
          onRefresh={() => void refresh()}
          tintColor={Colors.textMuted}
        />
      }
    >
      <Text variant="title">Friends</Text>
      <Text variant="caption" tone="secondary" style={styles.lead}>
        Letters travel only between friends. Ask someone by their username, and once they accept,
        you can write to each other.
      </Text>

      <View style={styles.section}>
        <TextField
          label="Their username"
          value={username}
          onChangeText={(value) => {
            setUsername(value);
            setFieldError(null);
          }}
          error={fieldError}
          hint={profile ? `Yours is @${profile.username}. Share it with friends.` : undefined}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="send"
          onSubmitEditing={() => void ask()}
        />
        <Button label="Send request" loading={asking} onPress={() => void ask()} />
        {outcome ? (
          <Text variant="caption" tone="available" accessibilityLiveRegion="polite">
            {outcome}
          </Text>
        ) : null}
      </View>

      {actionError ? (
        <Text variant="caption" tone="danger" style={styles.section}>
          {actionError}
        </Text>
      ) : null}

      {list.error && !list.data ? (
        <Text variant="caption" tone="danger" style={styles.section}>
          {list.error}
        </Text>
      ) : null}

      {list.isLoading && !list.data ? (
        <ActivityIndicator color={Colors.textMuted} style={styles.section} />
      ) : null}

      {groups.incoming.length > 0 ? (
        <Section title="Asking you">
          {groups.incoming.map((friendship) => (
            <ListRow
              key={friendship.id}
              title={friendName(friendship.friend)}
              subtitle={`@${friendship.friend.username} · asked ${formatTimestamp(friendship.requestedAt)}`}
              actions={
                <>
                  <Button
                    label="Accept"
                    size="compact"
                    loading={busyId === friendship.id && busy?.action === acceptFriend}
                    disabled={busyId !== null}
                    onPress={() => void act(friendship, acceptFriend)}
                  />
                  <Button
                    label="Decline"
                    size="compact"
                    variant="ghost"
                    loading={busyId === friendship.id && busy?.action === removeFriend}
                    disabled={busyId !== null}
                    onPress={() => void act(friendship, removeFriend)}
                  />
                </>
              }
            />
          ))}
        </Section>
      ) : null}

      {list.data ? (
        <Section title="Your friends">
          {groups.friends.length === 0 ? (
            <Text variant="caption" tone="muted" style={styles.empty}>
              No friends yet. Ask someone by their username above.
            </Text>
          ) : (
            groups.friends.map((friendship) => (
              <ListRow
                key={friendship.id}
                title={friendName(friendship.friend)}
                subtitle={describeFriend(friendship)}
                detail={describeRoute(friendship)}
                actions={
                  <>
                    <Button
                      label="Write"
                      size="compact"
                      variant="secondary"
                      accessibilityLabel={`Write to ${friendName(friendship.friend)}`}
                      disabled={busyId !== null || !friendship.route}
                      onPress={() => writeTo(friendship)}
                    />
                    <Button
                      label="Remove"
                      size="compact"
                      variant="ghost"
                      accessibilityLabel={`Remove ${friendName(friendship.friend)}`}
                      loading={busyId === friendship.id}
                      disabled={busyId !== null}
                      onPress={() => confirmRemove(friendship)}
                    />
                  </>
                }
              />
            ))
          )}
        </Section>
      ) : null}

      {groups.outgoing.length > 0 ? (
        <Section title="Waiting for an answer">
          {groups.outgoing.map((friendship) => (
            <ListRow
              key={friendship.id}
              title={`@${friendship.friend.username}`}
              subtitle={`Asked ${formatTimestamp(friendship.requestedAt)}`}
              actions={
                <Button
                  label="Withdraw"
                  size="compact"
                  variant="ghost"
                  loading={busyId === friendship.id}
                  disabled={busyId !== null}
                  onPress={() => void act(friendship, removeFriend)}
                />
              }
            />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

type FriendAction = (friendshipId: string) => Promise<void>;

/** "@ben · Munich, DE", or why there is no city to show. */
function describeFriend(friendship: Friendship): string {
  const { city, username } = friendship.friend;
  return `@${username} · ${city ? describeCity(city) : 'has not chosen a city yet'}`;
}

/**
 * "about 6h 18m by bat" - on a line of its own, so that the figure people look
 * for is never the part a narrow screen cuts off.
 */
function describeRoute(friendship: Friendship): string | undefined {
  return friendship.route
    ? `${formatFlightEstimate(friendship.route.flightSeconds)} by bat`
    : undefined;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="caption" tone="secondary" accessibilityRole="header">
        {title}
      </Text>
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  lead: { marginTop: Spacing.xs, lineHeight: 19 },
  section: { marginTop: Spacing.xl, gap: Spacing.sm },
  card: { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.xs },
  empty: { padding: Spacing.md, lineHeight: 19 },
});
