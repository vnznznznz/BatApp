import { AccessibilityInfo } from 'react-native';

/**
 * Says a short outcome aloud to VoiceOver and TalkBack users - "Request sent",
 * a refusal, a letter on its way - which would otherwise appear on screen in
 * silence while focus stays on the button they pressed.
 *
 * Optional-chained because some test environments leave it out.
 */
export function announce(message: string): void {
  AccessibilityInfo.announceForAccessibility?.(message);
}
