import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Colors, Spacing } from '@/constants/theme';
import {
  acceptFriend,
  describeRoute,
  describeStanding,
  fetchFriendships,
  friendName,
  removeFriend,
  type Friendship,
} from '@/features/friends/friends';
import { blockCourier } from '@/features/safety/safety';
import { announce } from '@/lib/announce';
import { confirmAction } from '@/lib/confirm';
import { messageOf } from '@/lib/rpc-error';
import { useRemote } from '@/lib/use-remote';

type Busy = 'accept' | 'end' | 'block';

/**
 * One courier from the friends list: who they are to you, what you can do -
 * and, apart from the rest, how to block or report them.
 *
 * Everything shown comes from `list_friends`, so it is exactly what the server
 * lets you know about them: a courier you have asked shows only a username.
 */
export default function CourierScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useRemote(fetchFriendships);
  const { reload } = list;
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const friendship = list.data?.find((entry) => entry.friend.id === id) ?? null;

  if (!list.data || !friendship) {
    return (
      <Screen center edges={['bottom']} style={styles.screen}>
        {list.data ? (
          <>
            <Text variant="body" tone="secondary" center>
              This courier is no longer among your friends or requests.
            </Text>
            <View style={styles.actions}>
              <Button
                label="Back to friends"
                variant="secondary"
                onPress={() => router.dismissTo('/friends')}
              />
            </View>
          </>
        ) : list.error ? (
          <>
            <Text variant="body" tone="danger" center>
              {list.error}
            </Text>
            <View style={styles.actions}>
              <Button label="Try again" variant="secondary" onPress={() => void reload()} />
            </View>
          </>
        ) : (
          <ActivityIndicator color={Colors.textMuted} />
        )}
      </Screen>
    );
  }

  const { friend } = friendship;
  const name = friendName(friend);
  const handle = `@${friend.username}`;

  /** Runs an action; `leaves` when the friendship will be gone afterwards. */
  async function run(action: Busy, work: () => Promise<unknown>, said: string, leaves: boolean) {
    setBusy(action);
    setError(null);
    try {
      await work();
      announce(said);
      // To the list by name rather than one step back, and only if this page is
      // still in front: by now the courier may have gone on somewhere else -
      // back to the roost, even, where `/friends` is no longer in the stack.
      if (leaves && navigation.isFocused()) router.dismissTo('/friends');
      else await reload();
    } catch (caught) {
      const problem = messageOf(caught);
      setError(problem);
      announce(problem);
      await reload();
    } finally {
      setBusy(null);
    }
  }

  function confirmEnd(current: Friendship) {
    if (current.status === 'pending') {
      const declining = current.direction === 'incoming';
      void run(
        'end',
        () => removeFriend(current.id),
        declining ? `Declined ${handle}.` : `Withdrew your request to ${handle}.`,
        true,
      );
      return;
    }
    confirmAction({
      title: `Stop being friends with ${name}?`,
      message:
        'Neither of you will be able to send the other letters. Letters already in the air ' +
        'still arrive, and the letters you have exchanged stay where they are.',
      confirmLabel: 'Remove',
      cancelLabel: 'Keep',
      destructive: true,
      onConfirm: () =>
        void run(
          'end',
          () => removeFriend(current.id),
          `You and ${name} are no longer friends.`,
          true,
        ),
    });
  }

  function confirmBlock() {
    confirmAction({
      title: `Block ${handle}?`,
      message:
        'Any friendship or request between you ends, and they cannot ask again. Their ' +
        'letters, already here or still in the air, are hidden from you; yours stay with ' +
        'them. They are not told, though they may notice. Blocking alone tells no one: to ' +
        'tell the person who runs Night Courier, report them instead - a report can block ' +
        'them as well.',
      confirmLabel: 'Block',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: () =>
        void run('block', () => blockCourier(friend.id), `${handle} is blocked.`, true),
    });
  }

  const endLabel =
    friendship.status === 'accepted'
      ? 'Remove friend'
      : friendship.direction === 'incoming'
        ? 'Decline'
        : 'Withdraw request';

  return (
    <Screen scroll edges={['bottom']} style={styles.screen}>
      <Text variant="title">{name}</Text>
      {friend.displayName ? (
        <Text variant="caption" tone="muted">
          {handle}
        </Text>
      ) : null}

      <View style={styles.facts}>
        <Text variant="caption" tone="secondary">
          {describeStanding(friendship)}
        </Text>
        {friendship.status === 'accepted' ? (
          <Text variant="caption" tone="secondary" style={styles.line}>
            {describeRoute(friendship)}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {friendship.status === 'accepted' ? (
          <Button
            label="Write a letter"
            disabled={busy !== null || !friendship.route}
            onPress={() => router.push({ pathname: '/compose', params: { to: friend.id } })}
          />
        ) : null}
        {friendship.status === 'pending' && friendship.direction === 'incoming' ? (
          <Button
            label="Accept"
            loading={busy === 'accept'}
            disabled={busy !== null}
            onPress={() =>
              void run(
                'accept',
                () => acceptFriend(friendship.id),
                `You and ${handle} are now friends.`,
                false,
              )
            }
          />
        ) : null}
        <Button
          label={endLabel}
          variant="secondary"
          loading={busy === 'end'}
          disabled={busy !== null}
          onPress={() => confirmEnd(friendship)}
        />
      </View>

      {error ? (
        <Text variant="caption" tone="danger" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <View style={styles.safety}>
        <Text variant="caption" tone="secondary" accessibilityRole="header">
          Safety
        </Text>
        <Text variant="caption" tone="muted" style={styles.line}>
          Blocking ends any friendship or request between you, hides their letters from you and
          stops them asking again; {handle} is not told. Reporting tells the person who runs Night
          Courier, who never tells {handle} who reported them.
        </Text>
        <Button
          label={`Block ${handle}`}
          variant="danger"
          loading={busy === 'block'}
          disabled={busy !== null}
          onPress={confirmBlock}
        />
        <Button
          label={`Report ${handle}`}
          variant="ghost"
          disabled={busy !== null}
          onPress={() =>
            router.push({
              pathname: '/report',
              params: { courier: friend.id, username: friend.username },
            })
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  facts: { marginTop: Spacing.md, gap: Spacing.xs },
  line: { lineHeight: 19 },
  actions: { alignSelf: 'stretch', marginTop: Spacing.xl, gap: Spacing.sm },
  error: { marginTop: Spacing.md },
  safety: {
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
