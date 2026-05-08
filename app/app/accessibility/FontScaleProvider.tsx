import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Dimensions, PixelRatio, type AppStateStatus } from 'react-native';
import Toast from 'react-native-toast-message';

type FontScaleContextValue = {
  fontScale: number;
  fontScaleVersion: number;
};

const FONT_SCALE_CHANGE_THRESHOLD = 0.01;
const FONT_SCALE_REFRESH_DELAY_MS = 180;

const FontScaleContext = createContext<FontScaleContextValue>({
  fontScale: PixelRatio.getFontScale(),
  fontScaleVersion: 0,
});

export function FontScaleProvider({ children }: { children: React.ReactNode }) {
  const [fontScale, setFontScale] = useState(() => PixelRatio.getFontScale());
  const [fontScaleVersion, setFontScaleVersion] = useState(0);
  const lastFontScaleRef = useRef(fontScale);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearPendingRefresh = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const checkFontScale = useCallback((showNotice: boolean) => {
    clearPendingRefresh();
    debounceRef.current = setTimeout(() => {
      if (!mountedRef.current) return;

      const nextFontScale = PixelRatio.getFontScale();
      const previousFontScale = lastFontScaleRef.current;
      if (Math.abs(nextFontScale - previousFontScale) <= FONT_SCALE_CHANGE_THRESHOLD) return;

      lastFontScaleRef.current = nextFontScale;
      setFontScale(nextFontScale);
      setFontScaleVersion((version) => version + 1);

      if (showNotice) {
        Toast.show({
          type: 'info',
          text1: 'Text size changed',
          text2: 'Layout has been refreshed.',
          visibilityTime: 1800,
        });
      }
    }, FONT_SCALE_REFRESH_DELAY_MS);
  }, [clearPendingRefresh]);

  useEffect(() => {
    mountedRef.current = true;

    const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        checkFontScale(true);
      }
    });

    const dimensionsSubscription = Dimensions.addEventListener('change', () => {
      checkFontScale(false);
    });

    return () => {
      mountedRef.current = false;
      clearPendingRefresh();
      appStateSubscription.remove();
      dimensionsSubscription.remove();
    };
  }, [checkFontScale, clearPendingRefresh]);

  const value = useMemo(
    () => ({ fontScale, fontScaleVersion }),
    [fontScale, fontScaleVersion]
  );

  return <FontScaleContext.Provider value={value}>{children}</FontScaleContext.Provider>;
}

export function useFontScale() {
  return useContext(FontScaleContext).fontScale;
}

export function useFontScaleVersion() {
  return useContext(FontScaleContext).fontScaleVersion;
}

export function useFontScaleRefreshKey(prefix = 'font-scale') {
  const version = useFontScaleVersion();
  return `${prefix}-${version}`;
}

