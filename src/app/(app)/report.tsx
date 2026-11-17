import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ChoiceList } from '@/components/choice-list';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { ToggleRow } from '@/components/toggle-row';
import { REPORT_NOTE_MAX_LENGTH, REPORT_REASONS, REPORT_RETENTION_DAYS } from '@/constants/config';
import { Spacing } from '@/constants/theme';
import {
  blockChoiceFor,
  noteLength,
  prepareNote,
  REASON_LABELS,
  rememberBlockChoice,
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
  courier?: string;
  username?: string;
  /** The letter, when it is a letter being reported. */
  letter?: string;
  /** '1' when the courier is blocked already: reported from the blocked list. */
  blocked?: string;
};

type Sent = {
  outcome: ReportOutcome;
  /** Whether this report made a block - which hides what the previous screen showed. */
  blockedNow: boolean;
};

const CHOICES = REPORT_REASONS.map((value) => ({ value, label: REASON_LABELS[value] }));

/**
 * Reporting a letter, or a courier, to the person who runs the service - and
 * blocking them in the same step, which is what someone reporting usually
 * wants and so is the default, unless the courier chose otherwise the last time
 * they reported the same person.
 */
export default function ReportScreen() {
  const router = useRouter();
  const { courier, username, letter, blocked } = useLocalSearchParams<Params>();
  const alreadyBlocked = blocked === '1';
  const handle = `@${username}`;

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  // On, unless they are blocked already - or the courier turned it off the
  // last time they reported the same person, and so meant to keep them.
  const [alsoBlock, setAlsoBlock] = useState(
    () => !alreadyBlocked && (courier ? blockChoiceFor(courier) : true),
  );
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);

  // A second tap in the same frame, before `sending` has re-rendered the
  // button, would send the report twice - and the answer that came back last
  // would say "already reported" to someone reporting for the first time.
  const inFlight = useRef(false);
  // And Done, likewise: two taps before the screen has gone would dismiss twice,
  // going back four screens instead of two - past the list. (Found in review.)
  const leaving = useRef(false);
  const heading = useRef<View>(null);

  // Once a report has made a block, the screen it came from has nothing left to
  // show - the letter is hidden, the friendship gone - so every way back goes
  // past it: Done, and Android's back button. The header's back button and the
  // swipe are taken away below. (Found in review: going back showed the letter
  // that had just been hidden.)
  const goesPast = sent?.blockedNow ?? false;

  const finish = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    if (router.canDismiss()) router.dismiss(goesPast ? 2 : 1);
    else router.replace('/home');
  }, [goesPast, router]);

  useFocusEffect(
    useCallback(() => {
      if (!goesPast) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        finish();
        return true;
      });
      return () => subscription.remove();
    }, [finish, goesPast]),
  );

  // The button that was pressed is gone once the confirmation replaces the
  // form; a screen reader is taken to what happened instead, which it reads
  // in full. The web build has no such call, so it hears the outcome there.
  useEffect(() => {
    if (sent && Platform.OS !== 'web' && heading.current) {
      AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
    }
  }, [sent]);

  if (!courier || !username) {
    return (
      <Screen center edges={['bottom']} style={styles.screen}>
        <Text variant="body" tone="secondary" center>
          There is nothing to report from here.
        </Text>
        <View style={styles.actions}>
          <Button
            label="Back to the roost"
            variant="secondary"
            onPress={() => router.dismissTo('/home')}
          />
        </View>
      </Screen>
    );
  }

  // Narrowed by the guard above, for the function below.
  const courierId = courier;
  const noteCount = noteLength(note);

  async function send() {
    if (inFlight.current) return;

    const missing = reason ? null : 'Choose what is wrong first.';
    const tooLong = validateNote(note);
    setReasonError(missing);
    setNoteError(tooLong);
    setFormError(null);
    if (!reason || tooLong) {
      announce(missing ?? tooLong ?? '');
      return;
    }

    inFlight.current = true;
    setSending(true);
    try {
      const blocking = alsoBlock && !alreadyBlocked;
      const report = { reason, note, alsoBlock: blocking };
      const outcome = letter
        ? await reportLetter(letter, report)
        : await reportCourier(courierId, report);
      const done = { outcome, blockedNow: blocking };
      if (!alreadyBlocked) rememberBlockChoice(courierId, blocking);
      setSent(done);
      if (Platform.OS === 'web') {
        const lines = describeSent(done, alreadyBlocked, handle, Boolean(letter));
        announce([TITLES[done.outcome], ...lines].join(' '));
      }
    } catch (caught) {
      const problem = messageOf(caught);
      setFormError(problem);
      announce(problem);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  if (sent) {
    const lines = describeSent(sent, alreadyBlocked, handle, Boolean(letter));
    const title = TITLES[sent.outcome];
    // A report that was not recorded, or added nothing to an earlier one, did
    // not take the note either. What was typed stays here, where it can be
    // copied, rather than going with the form.
    const noteKept = sent.outcome !== 'reported' && prepareNote(note) ? note : null;
    // Over the limit nothing was recorded, so neither was the note. "Already
    // reported" can follow a try that did reach the database, note and all,
    // and only lost its answer on the way back: then only this try added
    // nothing.
    const aboveNote =
      sent.outcome === 'limit_reached'
        ? 'Your note was not sent with it. Here it is, so you can keep it:'
        : 'Nothing was added to that report. Here is your note, so you can keep it:';
    return (
      <Screen scroll edges={['bottom']} style={styles.screen}>
        {/* headerBackVisible for iOS and Android; the web build's stack ignores it
            and shows a back button wherever headerLeft is unset. */}
        <Stack.Screen
          options={{
            headerBackVisible: !goesPast,
            headerLeft: goesPast ? () => null : undefined,
            gestureEnabled: !goesPast,
          }}
        />
        <View
          ref={heading}
          accessible
          accessibilityRole="header"
          accessibilityLabel={[title, ...lines].join(' ')}
        >
          <Text variant="title">{title}</Text>
        </View>
        <View style={styles.lines}>
          {lines.map((line) => (
            <Text key={line} variant="body" tone="secondary" style={styles.line}>
              {line}
            </Text>
          ))}
        </View>
        {noteKept ? (
          <View style={styles.lines}>
            <Text variant="caption" tone="secondary" style={styles.line}>
              {aboveNote}
            </Text>
            <Text variant="body" selectable style={styles.line}>
              {noteKept}
            </Text>
          </View>
        ) : null}
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
        {letter
          ? `Your report goes to the person who runs Night Courier, with a copy of the letter. ${handle} is not told who reported them, unless the law requires it - but this letter had only one reader, so if it is acted on, they may guess.`
          : `Your report goes to the person who runs Night Courier, with ${handle}'s names as they are now. ${handle} is not told who reported them, unless the law requires it.`}
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
        {/* As the letter field has: the limit seen coming, counted as the
            database counts it, rather than met as a refusal. */}
        <Text
          variant="caption"
          tone={noteCount > REPORT_NOTE_MAX_LENGTH ? 'danger' : 'muted'}
          style={styles.counter}
          accessibilityLabel={`${noteCount} of ${REPORT_NOTE_MAX_LENGTH} characters`}
        >
          {noteCount} / {REPORT_NOTE_MAX_LENGTH}
        </Text>
      </View>

      {alreadyBlocked ? null : (
        <View style={styles.section}>
          <ToggleRow
            label={`Also block ${handle}`}
            hint="Ends your friendship, hides their letters from you, and stops them asking again."
            value={alsoBlock}
            onValueChange={setAlsoBlock}
            disabled={sending}
          />
        </View>
      )}

      {formError ? (
        <Text variant="caption" tone="danger" style={styles.section}>
          {formError}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button label="Send report" loading={sending} onPress={() => void send()} />
      </View>

      <View style={[styles.section, styles.notes]}>
        <Text variant="caption" tone="muted" style={styles.line}>
          If their account is removed, every letter between you goes with it. Keep a copy of
          anything you may need first - a screenshot will do.
        </Text>
        <Text variant="caption" tone="muted" style={styles.line}>
          Reports{letter ? ', and the copy of the letter,' : ''} are deleted {REPORT_RETENTION_DAYS}{' '}
          days after they were made. If one is passed to the police, the police keep their own copy.
        </Text>
      </View>
    </Screen>
  );
}

const TITLES: Readonly<Record<ReportOutcome, string>> = {
  reported: 'Thank you',
  already_reported: 'Already reported',
  limit_reached: 'Not recorded',
};

/** What happened, in the order it matters. */
function describeSent(
  sent: Sent,
  alreadyBlocked: boolean,
  handle: string,
  aboutLetter: boolean,
): string[] {
  const blocked = sent.blockedNow || alreadyBlocked;
  // The limit counts the last 24 hours, not the calendar day, so "tomorrow"
  // could be too early. And once a block has hidden the letter, the blocked
  // list is no way to report it: a report from there carries no letter.
  const notRecorded =
    'You have made a lot of reports in the last 24 hours, so this one was not recorded.';
  const lines = [
    sent.outcome === 'reported'
      ? 'Your report is with the person who runs Night Courier.'
      : sent.outcome === 'already_reported'
        ? aboutLetter
          ? 'You have already reported this letter, and that report is still open.'
          : `You have already reported ${handle}, and that report is still open.`
        : !blocked
          ? `${notRecorded} Try again 24 hours from now.`
          : aboutLetter
            ? `${notRecorded} To report this letter 24 hours from now, unblock ${handle} in your profile, then open the letter and report it again. From your blocked couriers you can report ${handle} too, but without the letter.`
            : `${notRecorded} Report ${handle} again 24 hours from now, from your blocked couriers in your profile.`,
  ];
  if (sent.blockedNow) {
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
  notes: { gap: Spacing.sm },
  actions: { alignSelf: 'stretch', marginTop: Spacing.xl },
  counter: { alignSelf: 'flex-end', marginTop: Spacing.xs },
});
