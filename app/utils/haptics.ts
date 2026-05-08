import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function runHaptic(action: () => Promise<void>) {
  if (Platform.OS === 'web') return;
  action().catch(() => undefined);
}

export function hapticLight() {
  runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticSuccess() {
  runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function hapticWarning() {
  runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export function hapticError() {
  runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

export function hapticForNotice(type: 'success' | 'info' | 'warning' | 'error' | 'confirm' | 'destructive') {
  if (type === 'success') hapticSuccess();
  else if (type === 'warning' || type === 'destructive') hapticWarning();
  else if (type === 'error') hapticError();
}
