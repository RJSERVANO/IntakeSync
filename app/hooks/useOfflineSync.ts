import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getSyncQueueSummary } from '../services/syncQueue';
import { runOfflineSync } from '../services/offlineSyncManager';

export function useOfflineSync(token?: string) {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  const refreshSummary = useCallback(async () => {
    const summary = await getSyncQueueSummary();
    setPendingCount(summary.pending);
    setFailedCount(summary.failed);
    return summary;
  }, []);

  const syncNow = useCallback(async () => {
    const summary = await runOfflineSync(token);
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
