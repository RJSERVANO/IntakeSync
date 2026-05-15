import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { captureAuthSessionContext, isAuthSessionContextCurrent } from '../services/authSession';
import { getSyncQueueSummary } from '../services/syncQueue';
import { runOfflineSync } from '../services/offlineSyncManager';

export function useOfflineSync(token?: string) {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  const refreshSummary = useCallback(async () => {
    const context = await captureAuthSessionContext(token);
    if (token && !(await isAuthSessionContextCurrent(context))) return { total: 0, pending: 0, failed: 0, syncing: 0 };
    const summary = await getSyncQueueSummary();
    setPendingCount(summary.pending);
    setFailedCount(summary.failed);
    return summary;
  }, [token]);

  const syncNow = useCallback(async () => {
    const context = await captureAuthSessionContext(token);
    if (token && !(await isAuthSessionContextCurrent(context))) return getSyncQueueSummary();
    const summary = await runOfflineSync(token);
    if (token && !(await isAuthSessionContextCurrent(context))) return summary;
    setPendingCount(summary.pending);
    setFailedCount(summary.failed);
    return summary;
  }, [token]);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  useFocusEffect(
    useCallback(() => {
      void syncNow();
    }, [syncNow])
  );

  return { pendingCount, failedCount, refreshSummary, syncNow };
}
