import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { REPORT_RETENTION_DAYS } from '@/constants/config';
import { Spacing } from '@/constants/theme';

/**
 * The house rules: what everyone agrees to by signing up, and what happens to
 * those who break them.
 *
 * Reachable signed out, from the sign-up form, and signed in, from the
 * profile - which is why it lives outside the (app) group, and why the root
 * guard lets a signed-in courier stay on it.
 */
export default function RulesScreen() {
  const router = useRouter();

  return (
    <Screen scroll style={styles.screen}>
      <Text variant="title">House rules</Text>
      <Text variant="body" tone="secondary" style={styles.lead}>
        Night Courier is for letters between friends. Everyone here agrees to these rules when they
        create an account.
      </Text>

      <Section title="Never send">
        <Rule>Harassment, bullying, or anything meant to frighten or shame someone.</Rule>
        <Rule>Threats, or encouragement to violence or self-harm.</Rule>
        <Rule>Hate: attacks on people for who they are.</Rule>
        <Rule>Sexual content of any kind involving children, ever.</Rule>
        <Rule>Sexual messages or images to anyone who has not asked for them.</Rule>
        <Rule>Spam, scams, or pretending to be someone else.</Rule>
      </Section>

      <Section title="No tolerance">
        <Text variant="body" tone="secondary" style={styles.line}>
          There is no tolerance for objectionable content or abusive behaviour. An account that
          breaks these rules is removed, without warning when it is serious, along with the letters
          it sent.
        </Text>
      </Section>

      <Section title="If someone breaks them">
        <Text variant="body" tone="secondary" style={styles.line}>
          Report the letter - open it, and choose Report - or report the courier from their page in
          Friends. Reports go to the people who run Night Courier, who look at every one and remove
          what breaks the rules. The person you report is not told who reported them.
        </Text>
        <Text variant="body" tone="secondary" style={styles.line}>
          You can also block anyone, at any time. They cannot write to you or ask to be friends, and
          their letters are hidden from you. They are not told.
        </Text>
        <Text variant="caption" tone="muted" style={styles.line}>
          A report, and the copy it keeps of what was reported, is deleted after{' '}
          {REPORT_RETENTION_DAYS} days.
        </Text>
      </Section>

      <View style={styles.actions}>
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Rule({ children }: { children: string }) {
  return (
    <View style={styles.rule}>
      <Text
        variant="body"
        tone="secondary"
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        ·
      </Text>
      <Text variant="body" tone="secondary" style={[styles.line, styles.ruleText]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingVertical: Spacing.xl },
  lead: { marginTop: Spacing.sm, lineHeight: 22 },
  line: { lineHeight: 22 },
  section: { marginTop: Spacing.xl, gap: Spacing.sm },
  rule: { flexDirection: 'row', gap: Spacing.sm },
  ruleText: { flex: 1 },
  actions: { alignSelf: 'stretch', marginTop: Spacing.xl },
});
