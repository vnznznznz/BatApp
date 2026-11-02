import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ChoiceList } from '@/components/choice-list';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { ToggleRow } from '@/components/toggle-row';
import { REPORT_NOTE_MAX_LENGTH, REPORT_REASONS, REPORT_RETENTION_DAYS } from '@/constants/config';
import { Spacing } from '@/constants/theme';
import {
  REASON_LABELS,
  reportCourier,
  reportLetter,
  validateNote,
  type ReportOutcome,
  type ReportReason,
} from '@/features/safety/safety';
import { announce } from '@/lib/announce';
import { messageOf } from '@/lib/rpc-error';

type Params = {
  /** Who is being reported. */
  courier: string;
  username: string;
  /** The letter, when it is a letter being reported. */
  letter?: string;
};

const CHOICES = REPORT_REASONS.map((value) => ({ value, label: REASON_LABELS[value] }));

/**
 * Reporting a letter, or a courier, to the people who run the service - and
 * blocking them in the same step, which is what someone reporting usually
 * wants and so is the default.
 */
export default function ReportScreen() {
  const router = useRouter();
  const { courier, username, letter } = useLocalSearchParams<Params>();
  const handle = `@${username}`;

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ outcome: ReportOutcome; blocked: boolean } | null>(null);

  async function send() {
    const missing = reason ? null : 'Choose what is wrong first.';
    const tooLong = validateNote(note);
    setReasonError(missing);
    setNoteError(tooLong);
    setFormError(null);
    if (!reason || tooLong) {
      announce(missing ?? tooLong ?? '');
      return;
    }

    setSending(true);
    try {
      const report = { reason, note, alsoBlock };
      const outcome = letter
        ? await reportLetter(letter, report)
        : await reportCourier(courier, report);
      setSent({ outcome, blocked: alsoBlock });
      announce(describeSent(outcome, alsoBlock, handle, Boolean(letter)).join(' '));
    } catch (caught) {
      const problem = messageOf(caught);
      setFormError(problem);
      announce(problem);
    } finally {
      setSending(false);
    }
  }

  function finish() {
    // A block ended the friendship and hid the letter: the screen this came
    // from has nothing left to show, so go back past it too.
    router.dismiss(sent?.blocked ? 2 : 1);
  }

  if (sent) {
    return (
      <Screen scroll edges={['bottom']} style={styles.screen}>
        <Text variant="title">
          {sent.outcome === 'reported' ? 'Thank you' : 'Already reported'}
        </Text>
        <View style={styles.lines}>
          {describeSent(sent.outcome, sent.blocked, handle, Boolean(letter)).map((line) => (
            <Text key={line} variant="body" tone="secondary" style={styles.line}>
              {line}
            </Text>
          ))}
        </View>
        <View style={styles.actions}>
          <Button label="Done" onPress={finish} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll avoidKeyboard edges={['bottom']} style={styles.screen}>
      <Text variant="caption" tone="secondary">
        Report
      </Text>
      <Text variant="title">{letter ? `A letter from ${handle}` : handle}</Text>
      <Text variant="caption" tone="muted" style={[styles.line, styles.lead]}>
        Your report goes to the people who run Night Courier
        {letter ? ', with a copy of the letter' : ''}. {handle} is not told who reported them.
      </Text>

      <View style={styles.section}>
        <ChoiceList
          label="What is wrong?"
          choices={CHOICES}
          value={reason}
          onChange={(value) => {
            setReason(value);
            setReasonError(null);
          }}
          error={reasonError}
        />
      </View>

      <View style={styles.section}>
        <TextField
          label="Anything else we should know?"
          value={note}
          onChangeText={(value) => {
            setNote(value);
            setNoteError(null);
          }}
          error={noteError}
          hint={`Optional. Up to ${REPORT_NOTE_MAX_LENGTH} characters.`}
          multiline
          autoCapitalize="sentences"
        />
      </View>

      <View style={styles.section}>
        <ToggleRow
          label={`Also block ${handle}`}
          hint="Ends your friendship, hides their letters from you, and stops them asking again."
          value={alsoBlock}
          onValueChange={setAlsoBlock}
          disabled={sending}
        />
      </View>

      {formError ? (
        <Text variant="caption" tone="danger" style={styles.section}>
          {formError}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button label="Send report" loading={sending} onPress={() => void send()} />
      </View>

      <Text variant="caption" tone="muted" style={[styles.line, styles.section]}>
        Reports{letter ? ', and the copy of the letter,' : ''} are kept for {REPORT_RETENTION_DAYS}{' '}
        days and then deleted.
      </Text>
    </Screen>
  );
}

/** What happened, in the order it matters. */
function describeSent(
  outcome: ReportOutcome,
  blocked: boolean,
  handle: string,
  aboutLetter: boolean,
): string[] {
  const lines = [
    outcome === 'reported'
      ? 'Your report is with the people who run Night Courier.'
      : aboutLetter
        ? 'You had already reported this letter. Your first report stands.'
        : `You have already reported ${handle}, and that report is still open.`,
  ];
  if (blocked) {
    lines.push(
      `${handle} is blocked: they cannot write to you or ask to be friends, and their letters are hidden. You can unblock them in your profile.`,
    );
  }
  return lines;
}

const styles = StyleSheet.create({
  screen: { paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  lead: { marginTop: Spacing.sm },
  line: { lineHeight: 19 },
  lines: { marginTop: Spacing.md, gap: Spacing.sm },
  section: { marginTop: Spacing.xl },
  actions: { alignSelf: 'stretch', marginTop: Spacing.xl },
});
