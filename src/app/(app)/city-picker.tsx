import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { RELOCATION_HOURS } from '@/constants/config';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  type City,
  CITY_DATA_CREDIT,
  describeCity,
  MIN_QUERY_LENGTH,
  searchCities,
} from '@/features/cities/search';
import {
  useProfile,
  type CityCondition,
  type Profile,
  type ProfileCity,
} from '@/features/profile/use-profile';
import { confirmAction, type Confirmation } from '@/lib/confirm';
import { formatTimestamp } from '@/lib/format';

/** What the search said for one set of words: the cities found, or why it failed. */
type Answer = { term: string; cities: City[]; error: string | null };

export default function CityPickerScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { profile, updateCity } = useProfile();

  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Counts the courier's ways of saying "try again" after a failed search, so
  // that the same words are searched once more.
  const [attempt, setAttempt] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  // Identifies the most recent request, so a slow earlier response cannot
  // overwrite the results of a later keystroke.
  const latest = useRef(0);

  const term = query.trim();
  const tooShort = term.length < MIN_QUERY_LENGTH;

  useEffect(() => {
    // Nothing is set synchronously here on purpose: a setState in an effect
    // body triggers a second render pass before paint. What the list shows
    // until the answer comes is derived below instead.
    if (tooShort) return;

    const request = ++latest.current;

    // Debounced: one request per pause, not one per keystroke.
    const timer = setTimeout(async () => {
      try {
        const cities = await searchCities(term);
        if (request === latest.current) setAnswer({ term, cities, error: null });
      } catch (caught) {
        if (request === latest.current) {
          const error = caught instanceof Error ? caught.message : 'Search failed.';
          setAnswer({ term, cities: [], error });
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [term, tooShort, attempt]);

  // Derived rather than stored, so nothing about earlier words - their cities,
  // or that their search failed - is shown for these. Until the search for
  // these words has answered, the picker knows nothing about them, and says
  // nothing: no "no city by that name" before it has looked.
  const current = !tooShort && answer?.term === term ? answer : null;
  const searchFailed = current?.error != null;
  const shown = current?.cities ?? [];

  // The same words again after a failure - typed over, a space added, the
  // search key - are a request to try again; the search itself would not run,
  // since the words it searches for have not changed.
  function retryAfterFailure() {
    if (!searchFailed) return;
    setAnswer(null);
    setAttempt((count) => count + 1);
  }

  function choose(city: City) {
    // Nothing to change: it is their city already, settling or not.
    if (profile?.city?.id === city.id) {
      router.back();
      return;
    }
    // Once a letter has gone to or from the courier a change takes a day, so a
    // slip of the finger would cost a day to put right. Asked first, in the
    // words that fit.
    ask(city, profile, describeChoice(city, profile, new Date()));
  }

  /** Asks the question, and saves the city on its condition if the answer is yes. */
  function ask(city: City, asked: Profile | null, { condition, ...question }: Choice) {
    confirmAction({
      ...question,
      cancelLabel: 'Cancel',
      onConfirm: () => void save(city, asked, condition),
    });
  }

  /**
   * Saves the city on the condition the question rested on (see
   * `describeChoice`), so that the move is what the question said it would
   * be. A letter that came or went, or a move that settled, between the
   * question and the answer leaves it unsaved, and the question is asked
   * again in the words that hold now.
   */
  async function save(city: City, asked: Profile | null, condition: CityCondition | undefined) {
    setSaving(city.id);
    setSaveError(null);
    try {
      const outcome = await updateCity(city.id, condition);
      // Only if the picker is still in front: on a slow connection the courier
      // may have gone on - to a letter they are now writing - and going back
      // would close that instead.
      if (!navigation.isFocused()) {
        setSaving(null);
      } else if (outcome.saved) {
        router.back();
      } else {
        setSaving(null);
        ask(
          city,
          outcome.profile,
          describeAgain(city, asked, condition, outcome.profile, new Date()),
        );
      }
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'That city could not be saved.');
      setSaving(null);
    }
  }

  return (
    <Screen style={styles.screen} edges={['bottom']}>
      <Text variant="title">Where is your roost?</Text>
      <Text variant="caption" tone="secondary" style={styles.subtitle}>
        Your city decides how long your bats take to reach your friends. Nothing finer than the city
        is stored, and your location is never tracked. Once a letter has gone to or from you, your
        bats take a day to settle in after a move, and letters sent before then still leave from
        your old city.
      </Text>

      <View style={styles.search}>
        <TextField
          label="City"
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            retryAfterFailure();
          }}
          onSubmitEditing={retryAfterFailure}
          placeholder="Köln, Wien, Zürich…"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
        />
      </View>

      {current?.error ? (
        <Text variant="caption" tone="danger">
          {current.error}
        </Text>
      ) : null}
      {saveError ? (
        <Text variant="caption" tone="danger">
          {saveError}
        </Text>
      ) : null}

      <FlatList
        data={shown}
        keyExtractor={(city) => String(city.id)}
        keyboardShouldPersistTaps="handled"
        // The field takes focus as the picker opens, so the keyboard is up from
        // the start. These two are for iOS: the list's insets follow the
        // keyboard, so the last rows can be scrolled above it, and a drag puts
        // it away. Android draws the app edge to edge, where the window is not
        // resized for the keyboard, so there the last rows can stay under it
        // until the shared Screen component makes room (not yet tried on a
        // device).
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          tooShort ? (
            <Text variant="caption" tone="muted" style={styles.empty}>
              Type at least two letters.
            </Text>
          ) : !current ? (
            <ActivityIndicator color={Colors.textMuted} style={styles.empty} />
          ) : searchFailed ? null : (
            <Text variant="caption" tone="muted" style={styles.empty}>
              No city by that name. Try the nearest larger town.
            </Text>
          )
        }
        // GeoNames' licence asks for the credit wherever its data is shown.
        ListFooterComponent={
          <Text variant="caption" tone="muted" style={styles.credit}>
            {CITY_DATA_CREDIT}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            disabled={saving !== null}
            onPress={() => choose(item)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            {/* Where one of two towns of the same name is: "near Augsburg". */}
            <View style={styles.rowName}>
              <Text variant="body">{item.name}</Text>
              {item.qualifier ? (
                <Text variant="caption" tone="muted">
                  {item.qualifier}
                </Text>
              ) : null}
            </View>
            <View style={styles.rowMeta}>
              <Text variant="caption" tone="muted">
                {item.countryCode}
              </Text>
              {saving === item.id ? <ActivityIndicator color={Colors.textMuted} /> : null}
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

type Question = Pick<Confirmation, 'title' | 'message' | 'confirmLabel'>;

/** A question, and the condition a yes to it is saved on. */
type Choice = Question & { condition?: CityCondition };

/**
 * The question before a city is saved, as the database will treat it (see
 * `private.settle_city`): a first city, a move back to where the bats still
 * are, and any move before the courier's first letter count at once; any other
 * move takes RELOCATION_HOURS, from now, during which letters still leave from
 * - and land at - where the bats are; `lead` says so first.
 *
 * Its condition is what the words rest on: that no letter has gone to or from
 * the courier yet, or that the bats leave from where the question says - the
 * city it names, the one they would move back to, or nowhere. Without the
 * profile there is nothing to rest on, and the words hold either way.
 */
function describeChoice(
  city: City,
  profile: Profile | null,
  now: Date,
  lead = 'A move takes a day to count.',
): Choice {
  const name = describeCity(city);

  if (!profile) {
    return {
      title: `Make ${name} your city?`,
      message:
        'A first city counts at once, and so does a change until a letter has gone to or from ' +
        'you. After that, a move takes a day to count, and letters leave from your old city ' +
        'until then.',
      confirmLabel: 'Choose',
    };
  }

  // Bats that are nowhere: no city yet, or one cleared and the day since out.
  // No letter can go to or from a courier without a city, so none can come
  // in between and make this take a day.
  const departing = departingCity(profile, now);
  if (!departing) {
    return {
      title: `Make ${name} your city?`,
      message:
        profile.hasCorresponded === false
          ? `It counts at once: your bats fly from ${name} from now on. Until a letter has gone to or from you, a change counts at once too; after that, a new city takes a day to count.`
          : `It counts at once: your bats fly from ${name} from now on. If you change it later, the new city takes a day to count.`,
      confirmLabel: 'Choose',
      condition: { departing: null },
    };
  }

  if (departing.id === city.id) {
    return {
      title: `Move back to ${name}?`,
      message: 'Your bats are still there, so it counts at once.',
      confirmLabel: 'Move',
      condition: { departing: departing.id },
    };
  }

  if (profile.hasCorresponded === false) {
    return {
      title: `Move to ${name}?`,
      message: `It counts at once, since no letter has gone to or from you yet: your bats fly from ${name} from now on. From your first letter on, a move takes a day to count.`,
      confirmLabel: 'Move',
      condition: { beforeFirstLetter: true },
    };
  }

  return {
    ...describeDaysMove(city, departing, now, lead),
    condition: { departing: departing.id },
  };
}

/**
 * The question again, for a move that was not saved because what its
 * question rested on no longer held: in the words that hold for the profile
 * as it is now, saying first what changed when the move now takes a day.
 */
function describeAgain(
  city: City,
  asked: Profile | null,
  condition: CityCondition | undefined,
  profile: Profile,
  now: Date,
): Choice {
  // Nothing but a letter stops a move before the first one: the courier has
  // had one now, whatever a profile read a moment too early says.
  if (condition && 'beforeFirstLetter' in condition) {
    return describeChoice(
      city,
      { ...profile, hasCorresponded: true },
      now,
      'A letter has gone to or from you since, so a move now takes a day to count.',
    );
  }
  // The bats left a city they were settling away from: the move has settled.
  const settled = asked?.move != null && condition?.departing === asked.move.from.id;
  return describeChoice(
    city,
    profile,
    now,
    settled ? 'Your bats have finished settling in since. A move takes a day to count.' : undefined,
  );
}

/**
 * Where the courier's bats leave from as a change arrives, as
 * `private.settle_city` reads it: while a move is settling, the city it is
 * settling away from - even with the city cleared by hand in the meantime -
 * and otherwise the courier's city. Asked at the moment of the question, so
 * that a move which settled while the picker was open counts as settled.
 */
function departingCity(profile: Profile, now: Date): ProfileCity | null {
  return profile.move && profile.move.settlesAt.getTime() > now.getTime()
    ? profile.move.from
    : profile.city;
}

/** A move that takes a day: until when, and where letters leave from meanwhile. */
function describeDaysMove(
  city: City,
  departing: ProfileCity | null,
  now: Date,
  lead: string,
): Question {
  const settles = new Date(now.getTime() + RELOCATION_HOURS * 3_600_000);
  const from = departing ? describeCity(departing) : 'your old city';
  return {
    title: `Move to ${describeCity(city)}?`,
    message: `${lead} Until ${formatTimestamp(settles, now)}, your letters leave from ${from}, and your friends' letters land there.`,
    confirmLabel: 'Move',
  };
}

const styles = StyleSheet.create({
  screen: { paddingTop: Spacing.sm },
  credit: { marginTop: Spacing.lg, marginBottom: Spacing.xl, lineHeight: 19 },
  subtitle: { marginTop: Spacing.xs, lineHeight: 19 },
  search: { marginTop: Spacing.lg, marginBottom: Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
  },
  rowPressed: { backgroundColor: Colors.surface },
  rowName: { flexShrink: 1, gap: Spacing.xs },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  empty: { marginTop: Spacing.lg, textAlign: 'center' },
});
