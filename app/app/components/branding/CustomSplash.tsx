import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ImageBackground,
  Animated,
  FlatList,
  Dimensions,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  onFinish?: () => void;
  minimumMs?: number;
};

const onboardingScreens = [
  {
    key: '1',
    title: 'Beverage Tracking',
    description: 'Track your daily beverage intake effortlessly.',
    bgDecor: 'water',
    icon: 'water' as const,
  },
  {
    key: '2',
    title: 'Medication Reminders',
    description: 'Stay on schedule with helpful reminders.',
    bgDecor: 'pills',
    icon: 'medkit' as const,
  },
  {
    key: '3',
    title: 'Routine Dashboard',
    description: 'Monitor your beverage intake and medication adherence in one place.',
    bgDecor: 'dashboard',
    icon: 'bar-chart' as const,
  },
];

export default function SplashOnboarding({ onFinish, minimumMs = 2200 }: Props) {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [activeDotIndex, setActiveDotIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [splashFinished, setSplashFinished] = useState(false);
  const { width, height } = Dimensions.get('window');
  const flatListRef = useRef<FlatList>(null);
  const getStartedScale = useRef(new Animated.Value(0)).current;
  const personOpacity = useRef(new Animated.Value(1)).current;
  const personTranslate = useRef(new Animated.Value(0)).current;

  const bg = useMemo(() => require('../../../assets/images/mainbg.png'), []);
  const logo = useMemo(() => require('../../../assets/images/mainlogo.png'), []);

  // Splash animation + dots
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    const dotInterval = setInterval(() => {
      setActiveDotIndex(prev => (prev + 1) % 5); // 5 dots total, cycle through
    }, 400);

    const finishTimeout = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => setSplashFinished(true));
    }, minimumMs);

    return () => {
      clearInterval(dotInterval);
      clearTimeout(finishTimeout);
    };
  }, [fadeAnim, minimumMs]);
  // Auto-scroll onboarding screens every 5s
  useEffect(() => {
    if (splashFinished && flatListRef.current) {
      let index = 0;
      let isScrolling = true;
      const interval = setInterval(() => {
        if (!isScrolling) return;
        index += 1;
        if (index >= onboardingScreens.length) {
          isScrolling = false;
          clearInterval(interval);
          return;
        }
        try {
          flatListRef.current?.scrollToIndex({ index, animated: true });
        } catch {
          // Handle scroll error gracefully
          isScrolling = false;
          clearInterval(interval);
        }
      }, 5000);
      return () => {
        isScrolling = false;
        clearInterval(interval);
      };
    }
  }, [splashFinished]);

  // Animate "Get Started" appearance when onboarding shows
  useEffect(() => {
    if (splashFinished) {
      Animated.spring(getStartedScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 5,
        tension: 120,
      }).start();
    }
  }, [splashFinished, getStartedScale]);

  const onGetStarted = () => {
    // Animate the person (last screen visual) to fade and move up
    Animated.parallel([
      Animated.timing(personOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(personTranslate, { toValue: -20, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      onFinish && onFinish();
    });
  };

  // Splash
  if (!splashFinished) {
    return (
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ImageBackground source={bg} resizeMode="cover" style={styles.bg}>
          <View style={styles.overlay} />
          <View style={[styles.center, { justifyContent: 'flex-start', paddingTop: height * 0.08 }]}>
            <Image
              source={logo}
              style={[styles.logo, { width: width * 0.5, height: width * 0.5, marginBottom: -18, marginTop: height * 0.015 }]}
              resizeMode="contain"
            />
            {/* Gradient app name */}
            <Animated.Text
              style={[
                styles.appName,
                {
                  // simple color step to simulate gradient without extra libs
                  color: '#FFFFFF',
                  textShadowColor: 'rgba(255,255,255,0.35)',
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 8,
                },
              ]}
            >
              IntakeSync
            </Animated.Text>

            {/* Single tagline */}
            <Animated.Text style={[styles.tagline, { opacity: fadeAnim }]}>
              Helpful reminders for everyday routines.
            </Animated.Text>

            {/* Animated loading dots */}
            <Animated.View style={[styles.loadingDotsRow, { opacity: fadeAnim, marginTop: height * 0.06 }]}>
              {[0, 1, 2, 3, 4].map((index) => (
                <View
                  key={index}
                  style={[
                    styles.loadingDot,
                    {
                      opacity:
                        index === activeDotIndex ||
                        index === (activeDotIndex + 1) % 5 ||
                        index === (activeDotIndex + 2) % 5
                          ? 1
                          : 0.2,
                    },
                  ]}
                />
              ))}
            </Animated.View>
          </View>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 12, Platform.OS === 'ios' ? 28 : 22) }]}>
            <Text style={styles.footerText}>© {new Date().getFullYear()} IntakeSync</Text>
          </View>
        </ImageBackground>
      </Animated.View>
    );
  }

  // Onboarding screens
  return (
    <View style={styles.bg}>
      {/* Decorative background shapes for onboarding */}
      <View style={styles.decorShapeOne} />
      <View style={styles.decorShapeTwo} />
      <TouchableOpacity
        style={[styles.skipButton, { top: Math.max(insets.top + 10, 24) }]}
        onPress={onFinish}
        activeOpacity={0.82}
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>
      <FlatList
        ref={flatListRef}
        data={onboardingScreens}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.key}
        onViewableItemsChanged={({ viewableItems }) => {
          if (viewableItems.length > 0 && viewableItems[0].index !== null) {
            setCurrentPage(viewableItems[0].index);
          }
        }}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.onboardingScreen,
              {
                width,
                minHeight: height,
                paddingTop: Math.max(insets.top + 56, 88),
                paddingBottom: Math.max(insets.bottom + 26, 34),
              },
            ]}
          >
            {/* Per-screen rich decorations */}
            {item.bgDecor === 'water' && (
              <>
                <View style={styles.waveTop} />
                <View style={styles.waveBottom} />
              </>
            )}
            {item.bgDecor === 'pills' && (
              <>
                <View style={styles.pillLarge} />
                <View style={styles.pillSmall} />
              </>
            )}
            {item.bgDecor === 'dashboard' && (
              <>
                <View style={styles.chartBarLeft} />
                <View style={styles.chartBarRight} />
              </>
            )}

            {/* Content wrapper to center main content */}
            <View style={styles.slideContentWrapper}>
              <View style={styles.iconCircle}>
                <Ionicons name={item.icon} size={42} color="#1e3a8b" />
              </View>
              <Text style={styles.onboardingTitle}>{item.title}</Text>
              <Text style={styles.onboardingDescription}>{item.description}</Text>
              
              {/* Visible progress/next cue */}
              <View style={styles.nextCueRow}>
                <View style={[styles.nextDot, { opacity: currentPage === 0 ? 1 : 0.3 }]} />
                <View style={[styles.nextDot, { opacity: currentPage === 1 ? 1 : 0.3 }]} />
                <View style={[styles.nextDot, { opacity: currentPage === 2 ? 1 : 0.3 }]} />
              </View>

              {/* Last screen: interactive visual + animated button */}
              {item.key === '3' && (
                <View style={styles.lastScreenBlock}>
                  <Text style={styles.lastScreenText}>Create an account to start your journey</Text>
                <Animated.View
                  style={{
                    opacity: personOpacity,
                    transform: [{ translateY: personTranslate }],
                    marginTop: 22,
                  }}
                >
                  <View style={styles.dashboardSpacer} />
                </Animated.View>

                <Animated.View
                  style={{
                    transform: [
                      { scale: getStartedScale.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
                    ],
                    opacity: getStartedScale,
                    marginTop: 20,
                  }}
                >
                  <TouchableOpacity style={styles.getStartedBtnHigh} onPress={onGetStarted}>
                    <View style={styles.getStartedContent}>
                      <Text style={styles.getStartedText}>Get Started</Text>
                      <View style={styles.getStartedArrowBadge}>
                        <View style={styles.getStartedArrowIcon}>
                          <View style={styles.getStartedArrowShaft} />
                          <View style={styles.getStartedArrowHead} />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
                </View>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#1e3a8b',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30,58,138,0.35)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  appName: {
    marginTop: -2,
    color: '#FFFFFF',
    fontSize: 33,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tagline: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    fontWeight: '600',
  },
  loadingDotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFFFFF',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  onboardingScreen: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  slideContentWrapper: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    transform: [{ translateY: -30 }],
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 5,
  },
  onboardingTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    minHeight: 38,
  },
  onboardingDescription: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
    minHeight: 48,
    maxWidth: 290,
  },
  getStartedBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  getStartedText: {
    color: '#1e3a8b',
    fontSize: 18,
    fontWeight: '800',
  },
  skipButton: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  skipText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // Decorative shapes for background accents
  decorShapeOne: {
    position: 'absolute',
    top: 40,
    left: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  decorShapeTwo: {
    position: 'absolute',
    bottom: 100,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  // Per-screen rich decorations
  waveTop: {
    position: 'absolute',
    top: 80,
    left: -20,
    width: 220,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  waveBottom: {
    position: 'absolute',
    bottom: 140,
    right: -25,
    width: 180,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pillLarge: {
    position: 'absolute',
    top: 120,
    right: 40,
    width: 140,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.08)',
    transform: [{ rotate: '20deg' }],
  },
  pillSmall: {
    position: 'absolute',
    bottom: 160,
    left: 30,
    width: 90,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    transform: [{ rotate: '-15deg' }],
  },
  chartBarLeft: {
    position: 'absolute',
    top: 120,
    left: 50,
    width: 16,
    height: 100,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  chartBarRight: {
    position: 'absolute',
    top: 150,
    right: 60,
    width: 16,
    height: 140,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  nextCueRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 28,
    minHeight: 12,
    alignItems: 'center',
  },
  nextDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  lastScreenBlock: {
    marginTop: 28,
    alignItems: 'center',
    minHeight: 140,
  },
  lastScreenText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  dashboardSpacer: {
    width: 1,
    height: 36,
  },
  getStartedBtnHigh: {
    minWidth: 176,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  getStartedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  getStartedArrowBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E8F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  getStartedArrowIcon: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  getStartedArrowShaft: {
    width: 10,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#1e3a8b',
    position: 'absolute',
    left: 1,
  },
  getStartedArrowHead: {
    width: 7,
    height: 7,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: '#1e3a8b',
    transform: [{ rotate: '45deg' }],
    position: 'absolute',
    right: 1,
  },
});
