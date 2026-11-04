import { Stack, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import {
  BAN_PERIOD_YEARS,
  MINIMUM_AGE,
  PARENTAL_PERMISSION_UNDER,
  REPORT_RETENTION_DAYS,
} from '@/constants/config';
import { Colors, Spacing } from '@/constants/theme';
import { CONTACT_URL, openLink, PRIVACY_POLICY_URL } from '@/lib/links';

/**
 * The house rules: the terms of using Night Courier, which everyone agrees to by
 * signing up, and what happens to those who break them.
 *
 * Reachable signed out, from the sign-up form, and signed in, from the
 * profile - which is why it lives outside the (app) group, and why the root
 * guard lets a signed-in courier stay on it.
 */
export default function RulesScreen() {
  const router = useRouter();

  // Opened straight from a link, there is nothing behind it to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen scroll edges={['bottom']} style={styles.screen}>
      {/* The root stack shows no header; this screen wants the same back button
          as every screen in the app. */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
        }}
      />

      <Text variant="title">House rules</Text>
      <Text variant="body" tone="secondary" style={styles.lead}>
        These are the terms of using Night Courier. Everyone here agrees to them when they create an
        account.
      </Text>
      <Text variant="body" tone="secondary" style={styles.lead}>
        Night Courier is for letters between friends. Nobody can write to you until you accept their
        friend request, and there is no search and no public profile.
      </Text>

      <Section title="Who can join">
        <Text variant="body" tone="secondary" style={styles.line}>
          You must be at least {MINIMUM_AGE} to use Night Courier. If you are under{' '}
          {PARENTAL_PERMISSION_UNDER}, you need the permission of a parent or guardian, who can read
          these rules and the privacy policy with you. An account found to belong to someone younger
          than {MINIMUM_AGE} is deleted.
        </Text>
      </Section>

      <Section title="Never send">
        <Rule>Harassment, bullying, or anything meant to frighten or shame someone.</Rule>
        <Rule>Threats, or encouragement to violence or self-harm.</Rule>
        <Rule>Hate: attacks on people for who they are.</Rule>
        <Rule>
          Sexual content of any kind involving anyone under 18, or sent to anyone under 18.
        </Rule>
        <Rule>Sexual messages to anyone who has not asked for them.</Rule>
        <Rule>Spam, scams, or pretending to be someone else.</Rule>
      </Section>

      <Section title="No tolerance">
        <Text variant="body" tone="secondary" style={styles.line}>
          There is no tolerance for objectionable content or abusive behaviour. An account that
          breaks these rules may be removed, along with every letter it sent or received - at once,
          if it is serious. After a threat, it is suspended at once and removed a week later, so
          that whoever reported it can keep copies of their letters first. A removed account stays
          banned for {BAN_PERIOD_YEARS} years from the removal, so that the same email address
          cannot simply sign up again.
        </Text>
      </Section>

      <Section title="If someone breaks them">
        <Text variant="body" tone="secondary" style={styles.line}>
          Report the letter - open it, and choose Report - or report the courier from their page in
          Friends, or from your blocked couriers. Reports go to the person who runs Night Courier,
          who reads every one and acts on what breaks the rules. The person you report is not told
          who reported them, unless the law requires it - but a letter has only one reader, so if
          one is acted on, its sender may guess.
        </Text>
        <Text variant="body" tone="secondary" style={styles.line}>
          You can also block a courier, from a letter of theirs or from their page in Friends. Your
          friendship ends, they cannot write to you or ask to be friends, and their letters are
          hidden from you until you unblock them. They are not told, though they will see that you
          are no longer friends. Letters you sent them stay with them.
        </Text>
        <Text variant="caption" tone="muted" style={styles.line}>
          A report, and the copy it keeps of what was reported, is deleted {REPORT_RETENTION_DAYS}{' '}
          days after it was made. If it is passed to the police before then, the police keep their
          own copy, under their own rules. If an account is removed, every letter between it and
          anyone else goes with it, so keep a copy of anything you may need: a screenshot will do.
        </Text>
      </Section>

      {CONTACT_URL || PRIVACY_POLICY_URL ? (
        <Section title="Anything else">
          {CONTACT_URL ? (
            <>
              <Text variant="body" tone="secondary" style={styles.line}>
                For a question, something to add to a report, or a request about your data, get in
                touch.
              </Text>
              <Button
                label="Contact"
                variant="secondary"
                onPress={() => void openLink(CONTACT_URL)}
              />
            </>
          ) : null}
          {PRIVACY_POLICY_URL ? (
            <Button
              label="Privacy policy"
              variant="ghost"
              onPress={() => void openLink(PRIVACY_POLICY_URL)}
            />
          ) : null}
        </Section>
      ) : null}

      <View style={styles.actions}>
        <Button label="Back" variant="secondary" onPress={back} />
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
  screen: { paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  lead: { marginTop: Spacing.sm, lineHeight: 22 },
  line: { lineHeight: 22 },
  section: { marginTop: Spacing.xl, gap: Spacing.sm },
  rule: { flexDirection: 'row', gap: Spacing.sm },
  ruleText: { flex: 1 },
  actions: { alignSelf: 'stretch', marginTop: Spacing.xl },
});
