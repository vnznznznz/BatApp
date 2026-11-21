import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { announce } from '@/lib/announce';

/** What a screen reader reads for a stage's title and the words under it, as one. */
export const stageWords = (title: string, intro: string) => `${title}. ${intro}`;

/**
 * The title of a screen that has taken the place of a form, and the words
 * under it, read as one. A screen reader is taken to them when they are drawn:
 * the button that was pressed is gone by then, and the reader would stay on
 * nothing and say nothing of what is asked now. The web build has no such
 * call, and hears them instead. (Found in review.)
 *
 * Drawn again in place - the same screen in another stage - it moves nothing:
 * the screen says what has become of it itself, with the reason.
 */
export function StageHeading({
  title,
  intro,
  center = false,
}: {
  title: string;
  intro: string;
  /** Centres both, for a screen that only says what has happened. */
  center?: boolean;
}) {
  const heading = useRef<View>(null);
  const words = stageWords(title, intro);
  const first = useRef(words);

  useEffect(() => {
    if (Platform.OS === 'web') {
      announce(first.current);
      return;
    }
    if (heading.current) AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
  }, []);

  return (
    <View ref={heading} accessible accessibilityRole="header" accessibilityLabel={words}>
      <Text variant="title" center={center}>
        {title}
      </Text>
      <Text variant="body" tone="secondary" center={center} style={styles.intro}>
        {intro}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { marginTop: Spacing.sm },
});
