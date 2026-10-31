import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { UnreadDot } from '@/components/badge';
import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { Colors, Spacing } from '@/constants/theme';
import {
  correspondentName,
  fetchInbox,
  fetchSent,
  MAX_PAGE_SIZE,
  PAGE_SIZE,
  type ReceivedLetter,
  type SentLetter,
} from '@/features/messages/messages';
import { formatDistance, formatDuration, formatTimestamp } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { usePaged, type Paged } from '@/lib/use-paged';

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
  // Letters opened from this list. Opening marks a letter read on the server,
  // but a refresh brings back at most a hundred letters; remembering here keeps
  // the unread mark off a letter just read however deep in the list it was.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());

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
            onPress={() => {
              setOpened((previous) => new Set(previous).add(letter.id));
              router.push({ pathname: '/letters/[id]', params: { id: letter.id } });
            }}
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

  return (
    <LetterList
      paged={letters}
      empty="You have not sent a letter yet."
      renderItem={(letter: SentLetter) => {
        const landed = letter.delivered || letter.deliverAt.getTime() <= now;
        return (
          <ListRow
            title={`To ${correspondentName(letter.recipient)}`}
            subtitle={
              landed
                ? `Landed in ${letter.destination.name} · ${formatTimestamp(letter.deliverAt)}`
                : `In the air to ${letter.destination.name} · lands in ${formatDuration(letter.deliverAt.getTime() - now)}`
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
          <Text variant="caption" tone="danger" style={styles.message}>
            {paged.error}
          </Text>
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

/**
 * A letter's opening, run together for a two-line preview. Letters start with
 * "Dear Ben," and a blank line; kept as written, the preview would show the
 * greeting and then nothing.
 */
function asOneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
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
  retry: { marginTop: Spacing.lg, alignItems: 'center' },
});
