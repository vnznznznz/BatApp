import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { MIN_QUERY_LENGTH, searchCities, type City } from '@/features/cities/search';
import { useProfile } from '@/features/profile/use-profile';

export default function CityPickerScreen() {
  const router = useRouter();
  const { updateCity } = useProfile();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<City[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  // Identifies the most recent request, so a slow earlier response cannot
  // overwrite the results of a later keystroke.
  const latest = useRef(0);

  const term = query.trim();
  const tooShort = term.length < MIN_QUERY_LENGTH;

  useEffect(() => {
    // Nothing is set synchronously here on purpose: a setState in an effect
    // body triggers a second render pass before paint. What the list shows for
    // a too-short query is derived below instead.
    if (tooShort) return;

    const request = ++latest.current;

    // Debounced: one request per pause, not one per keystroke.
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchCities(term);
        if (request === latest.current) {
          setResults(found);
          setError(null);
        }
      } catch (caught) {
        if (request === latest.current) {
          setError(caught instanceof Error ? caught.message : 'Search failed.');
          setResults([]);
        }
      } finally {
        if (request === latest.current) setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [term, tooShort]);

  // Derived rather than stored, so a stale result set cannot flash on screen
  // after the field is cleared.
  const shown = tooShort ? [] : results;
  const emptyMessage = tooShort
    ? 'Type at least two letters.'
    : searching
      ? null
      : 'No city by that name. Try the nearest larger town.';

  async function choose(city: City) {
    setSaving(city.id);
    try {
      await updateCity(city.id);
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That city could not be saved.');
      setSaving(null);
    }
  }

  return (
    <Screen style={styles.screen}>
      <Text variant="title">Where is your roost?</Text>
      <Text variant="caption" tone="secondary" style={styles.subtitle}>
        Your city decides how long your bats take to reach your friends. Nothing finer than the city
        is stored, and your location is never tracked.
      </Text>

      <View style={styles.search}>
        <TextField
          label="City"
          value={query}
          onChangeText={setQuery}
          placeholder="Köln, Wien, Zürich…"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
        />
      </View>

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}

      <FlatList
        data={shown}
        keyExtractor={(city) => String(city.id)}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          emptyMessage ? (
            <Text variant="caption" tone="muted" style={styles.empty}>
              {emptyMessage}
            </Text>
          ) : (
            <ActivityIndicator color={Colors.textMuted} style={styles.empty} />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            disabled={saving !== null}
            onPress={() => void choose(item)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Text variant="body">{item.name}</Text>
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

const styles = StyleSheet.create({
  screen: { paddingTop: Spacing.lg },
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
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  empty: { marginTop: Spacing.lg, textAlign: 'center' },
});
