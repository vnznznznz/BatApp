import { Alert, Platform } from 'react-native';

/**
 * Asks before doing something that cannot be undone, and tells the user when
 * something failed - on every platform the app builds for.
 *
 * React Native Web implements `Alert.alert` as an empty function, so on the web
 * build a confirmation built on it silently never appears and its action can
 * never be taken. The browser's own dialogs stand in there.
 */

export type Confirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Styles the confirming button as destructive where the platform can. */
  destructive?: boolean;
  onConfirm: () => void;
};

export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
}: Confirmation): void {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

export function notify(title: string, message: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}
