import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Says a short outcome aloud to VoiceOver and TalkBack users - "Request sent",
 * a refusal, a letter on its way - which would otherwise appear on screen in
 * silence while focus stays on the button they pressed.
 *
 * React Native Web implements `announceForAccessibility` as an empty function,
 * as it does `Alert`, so on the web build the words go into a live region
 * instead, which screen readers there read out when it changes.
 *
 * Optional-chained because some test environments leave it out.
 */
export function announce(message: string): void {
  if (Platform.OS === 'web') {
    announceOnWeb(message);
    return;
  }
  AccessibilityInfo.announceForAccessibility?.(message);
}

const REGION_ID = 'night-courier-announcer';

function announceOnWeb(message: string): void {
  const page = globalThis.document;
  if (!page?.body) return;

  let region = page.getElementById(REGION_ID);
  if (!region) {
    region = page.createElement('div');
    region.id = REGION_ID;
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    // Present for screen readers, invisible on screen.
    Object.assign(region.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      margin: '-1px',
      padding: '0',
      border: '0',
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
      whiteSpace: 'nowrap',
    });
    page.body.appendChild(region);
  }

  // A region only speaks when its text changes, so the same words twice in a row
  // - a second failed attempt - are cleared first and set a moment later.
  const target = region;
  target.textContent = '';
  setTimeout(() => {
    target.textContent = message;
  }, 50);
}
