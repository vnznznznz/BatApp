import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { UnreadDot } from '@/components/badge';
import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { Colors, Spacing } from '@/constants/theme';
import {
  asOneLine,
  correspondentName,
  fetchInbox,
  fetchSent,
  MAX_PAGE_SIZE,
  onLetterOpened,
  PAGE_SIZE,
  type ReceivedLetter,
  type SentLetter,
} from '@/features/messages/messages';
import { AccountClosedActions } from '@/features/profile/account-closed';
import { formatDistance, formatDuration, formatTimestamp } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { usePaged, type Paged } from '@/lib/use-paged';
import { useRefreshAt } from '@/lib/use-refresh-at';

type Box = 'received' | 'sent';

const BOXES = [
  { value: 'received', label: 'Received' },
  { value: 'sent', label: 'Sent' },
] as const;

/**
 * Letters, received and sent.
 *
 * Received letters appear only once they have landed - before that, the
 * recipient is told nothing, not even that a bat is on the way. Sent letters
 * show whether they are still in the air, and never whether they have been
 * read: there are no read receipts.
 */
export default function LettersScreen() {
  const [box, setBox] = useState<Box>('received');

  return (
    <Screen edges={['bottom']} style={styles.screen}>
      <Text variant="title">Letters</Text>
      <View style={styles.switcher}>
        <SegmentedControl segments={BOXES} value={box} onChange={setBox} />
      </View>
      {/* One list mounted at a time, so each loads when it is first shown. */}
      {box === 'received' ? <ReceivedList /> : <SentList />}
    </Screen>
  );
}

function ReceivedList() {
  const router = useRouter();
  const letters = usePaged(fetchInbox, PAGE_SIZE, MAX_PAGE_SIZE);
  // Letters read while this list was shown. Reading marks a letter opened on
  // the server, but a refresh brings back at most a hundred letters;
  // remembering here keeps the unread mark off a letter just read however deep
  // in the list it was. Read, not tapped: a letter that then cannot be opened
  // is still unread, here as on the server. (Found in review.)
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => onLetterOpened((id) => setOpened((previous) => new Set(previous).add(id))), []);

  return (
    <LetterList
      paged={letters}
      empty="Nothing has landed yet. When a friend’s bat arrives, the letter will be here."
      renderItem={(letter: ReceivedLetter) => {
        const unread = letter.openedAt === null && !opened.has(letter.id);
        return (
          <ListRow
            title={correspondentName(letter.sender)}
            subtitle={`From ${letter.origin.name} · ${formatDistance(letter.distanceKm)} · ${formatTimestamp(letter.arrivedAt)}`}
            detail={asOneLine(letter.preview)}
            emphasised={unread}
            leading={<UnreadDot visible={unread} label="Unread" />}
            onPress={() => router.push({ pathname: '/letters/[id]', params: { id: letter.id } })}
          />
        );
      }}
    />
  );
}

function SentList() {
  const router = useRouter();
  const letters = usePaged(fetchSent, PAGE_SIZE, MAX_PAGE_SIZE);
  const now = useNow(1000);

  // Whether a letter has landed is the server's to say, here as on the roost
  // and on the letter itself. This list used to go by the phone's clock alone,
  // and on a phone running fast called a letter landed that was still in the
  // air everywhere else. (Found in review.) So it asks again when the next
  // letter is due, and keeps asking while one is overdue: fetching is what
  // lands it. `asked` changes after every such fetch, which is what sets the
  // next one. Quietly: the pull-down spinner is for a pull, and showed at
  // every landing, and up to once a minute on a phone whose clock runs ahead.
  const nextLanding = soonestLanding(letters.items);
  const { reload } = letters;
  const [asked, setAsked] = useState(0);
  const askAgain = useCallback(async () => {
    await reload();
    setAsked((times) => times + 1);
  }, [reload]);
  useRefreshAt(nextLanding, asked, askAgain);

  return (
    <LetterList
      paged={letters}
      empty="You have not sent a letter yet."
      renderItem={(letter: SentLetter) => {
        const remaining = letter.deliverAt.getTime() - now;
        return (
          <ListRow
            title={`To ${correspondentName(letter.recipient)}`}
            subtitle={
              letter.delivered
                ? `Landed in ${letter.destination.name} · ${formatTimestamp(letter.deliverAt)}`
                : remaining > 0
                  ? `In the air to ${letter.destination.name} · lands in ${formatDuration(remaining)}`
                  : `In the air to ${letter.destination.name} · landing any moment now`
            }
            detail={asOneLine(letter.preview)}
            onPress={() => router.push({ pathname: '/letters/[id]', params: { id: letter.id } })}
          />
        );
      }}
    />
  );
}

function LetterList<T extends { id: string }>({
  paged,
  empty,
  renderItem,
}: {
  paged: Paged<T>;
  empty: string;
  renderItem: (item: T) => ReactElement;
}) {
  return (
    <FlatList
      data={paged.items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => renderItem(item)}
      ItemSeparatorComponent={Separator}
      contentContainerStyle={styles.list}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        // Not after a failure: the error text and the spinner change the
        // list's height, which fires this again, and offline that became a
        // request loop with nobody touching the screen. The footer offers a
        // retry instead, and any successful load clears the error.
        if (paged.hasMore && !paged.isLoading && !paged.isLoadingMore && !paged.error) {
          void paged.loadMore();
        }
      }}
      refreshControl={
        <RefreshControl
          refreshing={paged.isRefreshing}
          onRefresh={() => void paged.refresh()}
          tintColor={Colors.textMuted}
        />
      }
      ListHeaderComponent={
        paged.error ? (
          <View style={styles.failed}>
            <Text variant="caption" tone="danger" style={styles.line}>
              {paged.error}
            </Text>
            {/* With letters on screen there is a list to pull down. With none,
                nothing shows that it can be pulled, and the error would say
                "try again" with no way to. (Found in review.) A suspended
                account would only be refused again: it is shown the way out
                instead. (Found in the browser.) */}
            {paged.reason === 'account_suspended' ? (
              <AccountClosedActions />
            ) : paged.items.length === 0 ? (
              <Button
                label="Try again"
                variant="secondary"
                loading={paged.isRefreshing}
                onPress={() => void paged.refresh()}
              />
            ) : null}
          </View>
        ) : null
      }
      ListEmptyComponent={
        paged.isLoading ? (
          <ActivityIndicator color={Colors.textMuted} style={styles.message} />
        ) : paged.error ? null : (
          <Text variant="caption" tone="muted" center style={styles.message}>
            {empty}
          </Text>
        )
      }
      ListFooterComponent={
        paged.isLoadingMore ? (
          <ActivityIndicator color={Colors.textMuted} style={styles.message} />
        ) : paged.error && paged.hasMore && paged.items.length > 0 ? (
          <View style={styles.retry}>
            <Button
              label="Load older letters"
              variant="secondary"
              size="compact"
              onPress={() => void paged.loadMore()}
            />
          </View>
        ) : null
      }
    />
  );
}

/** When the next of these letters lands, or null if none is in the air. */
function soonestLanding(letters: readonly SentLetter[]): number | null {
  let soonest: number | null = null;
  for (const letter of letters) {
    const landing = letter.deliverAt.getTime();
    if (!letter.delivered && (soonest === null || landing < soonest)) soonest = landing;
  }
  return soonest;
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: { paddingTop: Spacing.sm },
  switcher: { marginTop: Spacing.md, marginBottom: Spacing.sm },
  list: { paddingBottom: Spacing.xl, flexGrow: 1 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  message: { marginTop: Spacing.lg, lineHeight: 19 },
  failed: { marginTop: Spacing.lg, gap: Spacing.sm },
  line: { lineHeight: 19 },
  retry: { marginTop: Spacing.lg, alignItems: 'center' },
});
