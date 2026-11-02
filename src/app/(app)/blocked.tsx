import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Colors, Spacing } from '@/constants/theme';
import { fetchBlocked, unblockCourier, type BlockedCourier } from '@/features/safety/safety';
import { announce } from '@/lib/announce';
import { confirmAction } from '@/lib/confirm';
import { formatOnDay } from '@/lib/format';
import { messageOf } from '@/lib/rpc-error';
import { useRemote } from '@/lib/use-remote';

/**
 * The couriers you have blocked: the way to report one - their letters and
 * their page are out of reach once they are blocked, so this is the only place
 * left to do it from - and the way to let one back.
 *
 * Unblocking shows their letters again but does not make you friends again:
 * that takes a new request, and their yes.
 */
export default function BlockedScreen() {
  const router = useRouter();
  const list = useRemote(fetchBlocked);
  const { reload, refresh } = list;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Asked first: one stray tap would bring back the letters of someone blocked
  // for a reason and let them ask again - and someone blocked from a request
  // could not be blocked again until they sent another. (Found in review.)
  function confirmUnblock(courier: BlockedCourier) {
    confirmAction({
      title: `Unblock @${courier.username}?`,
      message:
        'Their letters come back, and they can ask to be friends again. You can block them ' +
        'again at any time.',
      confirmLabel: 'Unblock',
      cancelLabel: 'Keep blocked',
      onConfirm: () => void unblock(courier),
    });
  }

  function report(courier: BlockedCourier) {
    router.push({
      pathname: '/report',
      params: { courier: courier.id, username: courier.username, blocked: '1' },
    });
  }

  async function unblock(courier: BlockedCourier) {
    setBusyId(courier.id);
    setActionError(null);
    try {
      await unblockCourier(courier.id);
      announce(`@${courier.username} is unblocked.`);
    } catch (caught) {
      const problem = messageOf(caught);
      setActionError(problem);
      announce(problem);
    } finally {
      await reload();
      setBusyId(null);
    }
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
      <Text variant="title">Blocked couriers</Text>
      <Text variant="caption" tone="secondary" style={styles.lead}>
        They cannot write to you or ask to be friends, and you do not see their letters. Unblocking
        brings their letters back and lets them ask again; to write to each other, one of you has to
        ask to be friends.
      </Text>

      {actionError ? (
        <Text variant="caption" tone="danger" style={styles.section}>
          {actionError}
        </Text>
      ) : null}

      {list.error && !list.data ? (
        <View style={styles.section}>
          <Text variant="caption" tone="danger">
            {list.error}
          </Text>
          <Button label="Try again" variant="secondary" onPress={() => void reload()} />
        </View>
      ) : null}

      {list.isLoading && !list.data ? (
        <ActivityIndicator color={Colors.textMuted} style={styles.section} />
      ) : null}

      {list.data ? (
        <Card style={[styles.section, styles.card]}>
          {list.data.length === 0 ? (
            <Text variant="caption" tone="muted" style={styles.empty}>
              You have not blocked anyone.
            </Text>
          ) : (
            list.data.map((courier) => (
              <ListRow
                key={courier.id}
                title={`@${courier.username}`}
                subtitle={`Blocked ${formatOnDay(courier.blockedAt)}`}
                actions={
                  <>
                    <Button
                      label="Report"
                      size="compact"
                      variant="ghost"
                      accessibilityLabel={`Report @${courier.username}`}
                      disabled={busyId !== null}
                      onPress={() => report(courier)}
                    />
                    <Button
                      label="Unblock"
                      size="compact"
                      variant="secondary"
                      accessibilityLabel={`Unblock @${courier.username}`}
                      loading={busyId === courier.id}
                      disabled={busyId !== null}
                      onPress={() => confirmUnblock(courier)}
                    />
                  </>
                }
              />
            ))
          )}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  lead: { marginTop: Spacing.xs, lineHeight: 19 },
  section: { marginTop: Spacing.xl, gap: Spacing.sm },
  card: { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.xs },
  empty: { padding: Spacing.md, lineHeight: 19 },
});
