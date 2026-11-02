import { Linking } from 'react-native';

import { notify } from '@/lib/confirm';

/**
 * The two places the app links to outside itself: how to reach the person who
 * runs it, and the privacy policy.
 *
 * Both are configuration rather than code. This repository is public, and
 * neither may carry a personal address into it, so they come from the
 * environment like the Supabase settings, inlined at build time - which is
 * also why each is read as `process.env.EXPO_PUBLIC_NAME`, written out in full:
 * that is the only form Expo inlines. Unset, a link is simply not shown, which
 * is fine for development; a build for anyone else needs both (see
 * docs/GO-LIVE.md).
 */
export const CONTACT_URL = acceptableLink(process.env.EXPO_PUBLIC_CONTACT_URL);
export const PRIVACY_POLICY_URL = acceptableLink(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL);

/**
 * An https or mailto link as it was given, or null - for nothing, and for
 * anything else, which would open nowhere useful or somewhere unsafe.
 */
export function acceptableLink(value: string | undefined): string | null {
  const link = value?.trim();
  if (!link) return null;
  return /^https:\/\/\S+$/i.test(link) || /^mailto:[^\s@]+@[^\s@]+$/i.test(link) ? link : null;
}

/**
 * Opens a link, and says so when the device cannot - no mail app, say. Takes
 * the possibly-unset constants above as they are; there is nothing to open for
 * one that is not set, and the screens do not show its button anyway.
 */
export async function openLink(url: string | null): Promise<void> {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    notify('That could not be opened', url.replace(/^mailto:/i, ''));
  }
}
