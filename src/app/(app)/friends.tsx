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
import {
  acceptFriend,
  describeRequestOutcome,
  describeRoute,
  fetchFriendships,
  friendName,
  groupFriendships,
  removeFriend,
  requestFriend,
  withdrawRequest,
  type Friendship,
} from '@/features/friends/friends';
import { useProfile } from '@/features/profile/use-profile';
import { announce } from '@/lib/announce';
import { confirmAction, notify } from '@/lib/confirm';
import { formatTimestamp } from '@/lib/format';
import { messageOf, RpcError } from '@/lib/rpc-error';
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
  // The city picker, opened from here or from the profile, saves the city
  // itself and pops back: what this screen says about a city of the courier's
  // own is read again each time it comes back into view - by the hook itself,
  // which the screen used to repeat. (Found in the merged tree.)
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
    // What the screen says belongs to what was done last: a refusal from a row
    // left up beside this request would read as its answer.
    setOutcome(null);
    setActionError(null);
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

  async function act(friendship: Friendship, action: FriendAction, withdrawing = false) {
    setBusy({ id: friendship.id, action });
    setActionError(null);
    // Likewise a request's "sent" left beside this action's refusal.
    setOutcome(null);
    try {
      await action(friendship.id);
      await reload();
    } catch (caught) {
      const problem = messageOf(caught);
      if (withdrawing && caught instanceof RpcError && caught.reason === 'request_not_found') {
        // Withdraw is in the last section, and with a few friends above it the
        // top of the screen, where a row's refusal goes, is out of sight. The
        // request leaves the list as if withdrawn, though the two may be
        // friends now: a dialog makes sure that is read. It is read out, too.
        notify('Nothing to withdraw', problem);
      } else {
        setActionError(problem);
        announce(problem);
      }
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

  /** Their page: more about them, and the way to block or report them. */
  function open(friendship: Friendship) {
    router.push({ pathname: '/courier/[id]', params: { id: friendship.friend.id } });
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
          {/* The answers sit under the name rather than beside it: beside them, on a
              360dp phone, a 20-character username was cut to about 11 and when
              they asked fell off the line - and the username is how the courier
              knows who is asking. */}
          {groups.incoming.map((friendship) => (
            <View key={friendship.id}>
              <ListRow
                title={friendName(friendship.friend)}
                subtitle={`@${friendship.friend.username}`}
                detail={`Asked ${formatTimestamp(friendship.requestedAt)}`}
                onPress={() => open(friendship)}
                accessibilityHint={OPEN_HINT}
              />
              <View style={styles.answers}>
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
              </View>
            </View>
          ))}
        </Section>
      ) : null}

      {/* Without a city of their own no bat can leave, so every Write is off -
          beside the friend's city, which looks like the reason but is not.
          Nothing is said while the profile is unknown. A route on the list
          means a city all the same: the two are read side by side as the
          screen comes back, and either may answer first. */}
      {profile &&
      !profile.city &&
      groups.friends.length > 0 &&
      !groups.friends.some((friendship) => friendship.route) ? (
        <View style={styles.section}>
          <Text variant="caption" tone="secondary" style={styles.lead}>
            You have not chosen your city yet, so your bats cannot carry a letter anywhere. Choose
            it here, or in your profile.
          </Text>
          <Button
            label="Choose your city"
            variant="secondary"
            onPress={() => router.push('/city-picker')}
          />
        </View>
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
                onPress={() => open(friendship)}
                accessibilityHint={OPEN_HINT}
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
              onPress={() => open(friendship)}
              accessibilityHint={OPEN_HINT}
              actions={
                <Button
                  label="Withdraw"
                  size="compact"
                  variant="ghost"
                  loading={busyId === friendship.id}
                  disabled={busyId !== null}
                  // Not removeFriend: if they said yes a moment ago, that would
                  // end the new friendship without the usual question.
                  onPress={() =>
                    void act(
                      friendship,
                      (id) => withdrawRequest(id, friendship.friend.username),
                      true,
                    )
                  }
                />
              }
            />
          ))}
        </Section>
      ) : null}

      {list.data && list.data.length > 0 ? (
        <Text variant="caption" tone="muted" style={styles.section}>
          Tap a name to see more about someone, or to block or report them.
        </Text>
      ) : null}
    </Screen>
  );
}

type FriendAction = (friendshipId: string) => Promise<void>;

const OPEN_HINT = 'Opens their page, where you can also block or report them.';

/** "@ben" - alone on its line, so a long username cannot crowd out the city. */
function describeFriend(friendship: Friendship): string {
  return `@${friendship.friend.username}`;
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
  answers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
});
