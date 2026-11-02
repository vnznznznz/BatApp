import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Colors, Spacing } from '@/constants/theme';
import { describeCity } from '@/features/cities/search';
import { correspondentName, readMessage, type Letter } from '@/features/messages/messages';
import { blockCourier } from '@/features/safety/safety';
import { announce } from '@/lib/announce';
import { confirmAction } from '@/lib/confirm';
import { formatDistance, formatDuration, formatTimestamp } from '@/lib/format';
import { messageOf } from '@/lib/rpc-error';
import { useNow } from '@/lib/use-now';
import { useRefreshAt } from '@/lib/use-refresh-at';
import { useRemote } from '@/lib/use-remote';

/**
 * One letter, whole.
 *
 * Opening a received letter marks it read - on the server, for the recipient's
 * own inbox, and never for the sender. A letter you sent that is still in the
 * air shows its countdown, and lands on screen when it lands.
 */
export default function LetterScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => readMessage(id), [id]);
  const letter = useRemote(load);
  const now = useNow(1000);
  const { reload } = letter;
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  const landsAt = letter.data && !letter.data.delivered ? letter.data.deliverAt.getTime() : null;

  // Fetching again once the arrival time passes is what lands it.
  useRefreshAt(landsAt, letter.settledAt, reload);

  if (!letter.data) {
    return (
      <Screen center edges={['bottom']} style={styles.screen}>
        {letter.error ? (
          <>
            <Text variant="body" tone="danger" center>
              {letter.error}
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

  const data = letter.data;
  const received = data.direction === 'received';
  const handle = `@${data.other.username}`;

  function confirmBlock() {
    confirmAction({
      title: `Block ${handle}?`,
      message:
        'Your friendship ends, they cannot ask to be friends again, and their letters - this ' +
        'one too - are hidden from you. They are not told. You can unblock them later in ' +
        'your profile.',
      confirmLabel: 'Block',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: () => void block(),
    });
  }

  async function block() {
    setBlocking(true);
    setBlockError(null);
    try {
      await blockCourier(data.other.id);
      announce(`${handle} is blocked.`);
      // The letter is hidden now; there is nothing left here to show.
      router.back();
    } catch (caught) {
      const problem = messageOf(caught);
      setBlockError(problem);
      announce(problem);
    } finally {
      setBlocking(false);
    }
  }

  return (
    <Screen scroll edges={['bottom']} style={styles.screen}>
      <Text variant="caption" tone="secondary">
        {received ? 'From' : 'To'}
      </Text>
      <Text variant="title">{correspondentName(data.other)}</Text>
      <Text variant="caption" tone="muted">
        @{data.other.username}
      </Text>

      <Card style={styles.card}>
        <Text variant="body" selectable>
          {data.body}
        </Text>
      </Card>

      <View style={styles.meta}>
        {describeJourney(data, now).map((line) => (
          <Text key={line} variant="caption" tone="secondary" style={styles.line}>
            {line}
          </Text>
        ))}
      </View>

      {received ? (
        <>
          <View style={styles.actions}>
            <Button
              label="Write back"
              onPress={() => router.push({ pathname: '/compose', params: { to: data.other.id } })}
            />
          </View>

          {/* Apart from writing back, and quieter: what to do about a letter that should not
              have been sent. */}
          <View style={styles.safety}>
            {blockError ? (
              <Text variant="caption" tone="danger">
                {blockError}
              </Text>
            ) : null}
            <Button
              label="Report this letter"
              variant="ghost"
              disabled={blocking}
              onPress={() =>
                router.push({
                  pathname: '/report',
                  params: {
                    letter: data.id,
                    courier: data.other.id,
                    username: data.other.username,
                  },
                })
              }
            />
            <Button
              label={`Block ${handle}`}
              variant="ghost"
              loading={blocking}
              onPress={confirmBlock}
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

/** Where the letter went, and when - in the past tense once it has landed. */
function describeJourney(letter: Letter, now: number): string[] {
  const from = describeCity(letter.origin);
  const to = describeCity(letter.destination);
  const distance = formatDistance(letter.distanceKm);
  const duration = formatDuration(letter.deliverAt.getTime() - letter.sentAt.getTime());

  if (!letter.delivered) {
    const remaining = letter.deliverAt.getTime() - now;
    const landing =
      remaining > 0 ? `Lands in ${formatDuration(remaining)}` : 'Landing any moment now';
    return [
      `Flying ${distance} from ${from} to ${to}.`,
      `Sent ${formatTimestamp(letter.sentAt)}. ${landing}, at ${formatTimestamp(letter.deliverAt)}.`,
    ];
  }

  return [
    `Flew ${distance} from ${from} to ${to}, in ${duration}.`,
    `Sent ${formatTimestamp(letter.sentAt)}. Landed ${formatTimestamp(letter.deliverAt)}.`,
  ];
}

const styles = StyleSheet.create({
  screen: { paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  card: { marginTop: Spacing.lg },
  meta: { marginTop: Spacing.lg, gap: Spacing.xs },
  line: { lineHeight: 19 },
  actions: { alignSelf: 'stretch', marginTop: Spacing.xl },
  safety: {
    alignSelf: 'stretch',
    marginTop: Spacing.xl,
    paddingTop: Spacing.md,
    gap: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
