import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FlyingBat } from '@/components/flying-bat';
import { Text } from '@/components/text';
import { Colors, Spacing } from '@/constants/theme';
import { describeProgress, pointOnArc } from '@/lib/flight';

export type FlightPathProps = {
  /** Where the bat left from, and where it is going: city names. */
  from: string;
  to: string;
  /** 0 to 1, from `flightProgress`. */
  progress: number;
};

/** Dots along the arc: enough to read as a path at any phone width. */
export const PATH_DOTS = 25;

const HEIGHT = 96;
const LIFT = 30;
const INSET = 14;
const BAT = 34;
const GROUND = HEIGHT - 18;

/**
 * A letter's flight, drawn: an arc of dots from one city to the other, lit
 * behind the bat and dim ahead of it, with the bat where the clock says it is.
 *
 * Drawn from plain views, so it needs nothing beyond React Native. To a screen
 * reader it is one image, described in words - how far along, from where to
 * where.
 */
export function FlightPath({ from, to, progress }: FlightPathProps) {
  const [width, setWidth] = useState(0);
  const at = Math.min(1, Math.max(0, progress));

  const start = { x: INSET, y: GROUND };
  const end = { x: width - INSET, y: GROUND };
  const bat = pointOnArc(start, end, LIFT, at);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={describeProgress(at, from, to)}>
      <View
        testID="flight-path-sky"
        style={styles.sky}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {width > 0 ? (
          <>
            {Array.from({ length: PATH_DOTS }, (_, i) => {
              const t = i / (PATH_DOTS - 1);
              const point = pointOnArc(start, end, LIFT, t);
              return (
                <View
                  key={i}
                  testID={t <= at ? 'path-dot-flown' : 'path-dot-ahead'}
                  style={[
                    styles.dot,
                    t <= at ? styles.flown : styles.ahead,
                    { left: point.x - DOT / 2, top: point.y - DOT / 2 },
                  ]}
                />
              );
            })}
            <View style={[styles.place, { left: start.x - PLACE / 2, top: start.y - PLACE / 2 }]} />
            <View style={[styles.place, { left: end.x - PLACE / 2, top: end.y - PLACE / 2 }]} />
            <View
              testID="flight-path-bat"
              style={[styles.bat, { left: bat.x - BAT / 2, top: bat.y - BAT / 2 }]}
            >
              <FlyingBat size={BAT} tint={Colors.batFlying} flying={at < 1} />
            </View>
          </>
        ) : null}
      </View>
      <View style={styles.labels}>
        <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.label}>
          {from}
        </Text>
        <Text
          variant="caption"
          tone="secondary"
          numberOfLines={1}
          style={[styles.label, styles.right]}
        >
          {to}
        </Text>
      </View>
    </View>
  );
}

const DOT = 3;
const PLACE = 9;

const styles = StyleSheet.create({
  sky: {
    height: HEIGHT,
  },
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  flown: {
    backgroundColor: Colors.batFlying,
  },
  ahead: {
    backgroundColor: Colors.borderStrong,
  },
  place: {
    position: 'absolute',
    width: PLACE,
    height: PLACE,
    borderRadius: PLACE / 2,
    borderWidth: 2,
    borderColor: Colors.textSecondary,
    backgroundColor: Colors.background,
  },
  bat: {
    position: 'absolute',
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  label: {
    flex: 1,
  },
  right: {
    textAlign: 'right',
  },
});
