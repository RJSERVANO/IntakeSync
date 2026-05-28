import Ionicons from '@expo/vector-icons/Ionicons';

export type TopNotice = {
  message: string;
  iconName: keyof typeof Ionicons.glyphMap;
  variant?: 'sync' | 'info' | 'warning';
};

export function deriveTopNotice({
  actionNotice,
  isDeviceOffline,
  backendReachable,
  syncing,
  pendingCount,
}: {
  actionNotice?: string | null;
  isDeviceOffline: boolean;
  backendReachable: boolean | null;
  syncing: boolean;
  pendingCount?: number;
}): TopNotice | null {
  if (actionNotice) return { message: actionNotice, iconName: 'checkmark-circle-outline', variant: 'info' };
  if (isDeviceOffline) return { message: 'Offline mode', iconName: 'cloud-offline-outline', variant: 'info' };
  if (backendReachable === false) {
    return {
      message: 'Connection unavailable. Changes will sync when connection is restored.',
      iconName: 'cloud-offline-outline',
      variant: 'warning',
    };
  }
  if (syncing) return { message: 'Syncing...', iconName: 'sync-outline', variant: 'sync' };
  if ((pendingCount || 0) > 0) {
    return {
      message: `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync.`,
      iconName: 'sync-outline',
      variant: 'info',
    };
  }
  return null;
}
