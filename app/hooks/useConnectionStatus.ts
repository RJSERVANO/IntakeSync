import { useEffect, useMemo, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import * as api from '../app/api';

export function useConnectionStatus(token?: string | null) {
  const [deviceOnline, setDeviceOnline] = useState(true);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(api.getBackendReachabilitySnapshot().reachable);
  const [backendChecking, setBackendChecking] = useState(api.getBackendReachabilitySnapshot().checking);

  useEffect(() => {
    const unsubscribeBackend = api.subscribeBackendReachability((state) => {
      setBackendReachable(state.reachable);
      setBackendChecking(state.checking);
    });

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setDeviceOnline(online);
      if (online) {
        void api.checkBackendReachability(token || undefined, true);
      } else {
        setBackendReachable(false);
      }
    });

    NetInfo.fetch().then((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setDeviceOnline(online);
      if (online) void api.checkBackendReachability(token || undefined);
      else setBackendReachable(false);
    }).catch(() => {
      setDeviceOnline(false);
      setBackendReachable(false);
    });

    return () => {
      unsubscribeBackend();
      unsubscribeNetInfo();
    };
  }, [token]);

  return useMemo(() => ({
    isDeviceOffline: !deviceOnline,
    backendReachable: deviceOnline ? backendReachable : false,
    backendChecking,
    refreshBackendReachability: (force = true) => api.checkBackendReachability(token || undefined, force),
  }), [backendChecking, backendReachable, deviceOnline, token]);
}
