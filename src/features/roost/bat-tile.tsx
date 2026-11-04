import { Pressable, StyleSheet, View } from 'react-native';

import { BatMark } from '@/components/bat-mark';
import { FlyingBat } from '@/components/flying-bat';
import { Text } from '@/components/text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Bat } from '@/features/roost/roost';
import { flightProgress } from '@/lib/flight';
import { formatDuration } from '@/lib/format';

export type BatTileProps = {
  bat: Bat;
  /** The current time, from the screen's ticking clock. */
  now: number;
  onPress?: () => void;
};

/**
 * One bat in the roost: at home, or in the air with a countdown to landing.
 *
 * The countdown is computed from the arrival time the server set when the
 * letter left. At zero it reads "any moment now" until the roost is fetched
 * again, which lands the letter and brings the bat home.
 */
export function BatTile({ bat, now, onPress }: BatTileProps) {
  const flying = bat.status === 'flying';
  const flight = bat.flight;
  const remaining = flight ? flight.deliverAt.getTime() - now : 0;
  const progress = flight ? flightProgress(flight.sentAt, flight.deliverAt, now) : 0;

  const label = flying
    ? flight
      ? remaining > 0
        ? `Bat ${bat.slot}, flying to ${flight.recipient.displayName}, lands in ${formatDuration(remaining)}`
        : `Bat ${bat.slot}, flying to ${flight.recipient.displayName}, landing any moment now`
      : `Bat ${bat.slot}, flying`
    : `Bat ${bat.slot}, at home`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        flying ? styles.flying : styles.home,
        pressed && styles.pressed,
      ]}
    >
      {flying ? (
        <FlyingBat size={52} tint={Colors.batFlying} />
      ) : (
        <BatMark
          size={52}
          tint={Colors.batAvailable}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <Text variant="label" tone={flying ? 'flying' : 'available'} center>
        {flying ? 'In flight' : 'Home'}
      </Text>
      <View style={styles.detail}>
        {flight ? (
          <>
            <Text variant="caption" tone="secondary" center numberOfLines={1}>
              to {flight.recipient.displayName}
            </Text>
            <Text variant="mono" center numberOfLines={1} adjustsFontSizeToFit>
              {formatDuration(remaining)}
            </Text>
            {/* How far it has come; the countdown above says the same in words. */}
            <View
              style={styles.track}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View
                testID="flight-progress"
                style={[styles.fill, { width: `${progress * 100}%` }]}
              />
            </View>
          </>
        ) : (
          <Text variant="caption" tone="muted" center>
            {flying ? ' ' : 'Ready'}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: Colors.surfaceRaised,
  },
  home: {
    borderColor: Colors.border,
  },
  flying: {
    borderColor: Colors.batFlying,
  },
  pressed: {
    backgroundColor: Colors.surfacePressed,
  },
  detail: {
    alignSelf: 'stretch',
    alignItems: 'center',
    minHeight: 40,
  },
  track: {
    alignSelf: 'stretch',
    height: 3,
    marginTop: Spacing.xs,
    marginHorizontal: Spacing.sm,
    borderRadius: 2,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.batFlying,
  },
});
