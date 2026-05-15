import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ImageBackground,
  Animated,
  FlatList,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFontScaleVersion } from '../../accessibility/FontScaleProvider';
import { FONT_SCALE } from '../../../utils/fontScaling';

type Props = {
  onFinish?: () => void;
  minimumMs?: number;
  mode?: 'full' | 'logo';
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

export default function SplashOnboarding({ onFinish, minimumMs = 2200, mode = 'full' }: Props) {
  useFontScaleVersion();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [activeDotIndex, setActiveDotIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [splashFinished, setSplashFinished] = useState(false);
  const { width, height } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);
  const getStartedScale = useRef(new Animated.Value(0)).current;
  const getStartedPressScale = useRef(new Animated.Value(1)).current;
  const getStartedBreathScale = useRef(new Animated.Value(1)).current;
  const iconFloat = useRef(new Animated.Value(0)).current;
  const iconPulse = useRef(new Animated.Value(0)).current;
  const rippleScale = useRef(new Animated.Value(0)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;
  const decorDrift = useRef(new Animated.Value(0)).current;
  const decorOpacity = useRef(new Animated.Value(0)).current;
  const dashboardBarOne = useRef(new Animated.Value(0.72)).current;
  const dashboardBarTwo = useRef(new Animated.Value(0.56)).current;
  const dashboardBarThree = useRef(new Animated.Value(0.84)).current;
  const personOpacity = useRef(new Animated.Value(1)).current;
  const personTranslate = useRef(new Animated.Value(0)).current;

  const bg = useMemo(() => require('../../../assets/images/mainbg.png'), []);
  const logo = useMemo(() => require('../../../assets/images/customsplash.png'), []);

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

    if (mode === 'logo') {
      return () => {
        clearInterval(dotInterval);
      };
    }

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
  }, [fadeAnim, minimumMs, mode]);
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

  useEffect(() => {
    if (!splashFinished) return undefined;

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(iconFloat, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(iconFloat, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulse, { toValue: 1, duration: 1900, useNativeDriver: true }),
        Animated.timing(iconPulse, { toValue: 0, duration: 1900, useNativeDriver: true }),
      ])
    );
    const rippleLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(rippleScale, { toValue: 1, duration: 2100, useNativeDriver: true }),
          Animated.timing(rippleOpacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        ]),
        Animated.timing(rippleOpacity, { toValue: 0, duration: 950, useNativeDriver: true }),
        Animated.timing(rippleScale, { toValue: 0, duration: 1, useNativeDriver: true }),
      ])
    );
    const decorLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(decorDrift, { toValue: 1, duration: 3600, useNativeDriver: true }),
          Animated.timing(decorOpacity, { toValue: 1, duration: 3600, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(decorDrift, { toValue: 0, duration: 3600, useNativeDriver: true }),
          Animated.timing(decorOpacity, { toValue: 0, duration: 3600, useNativeDriver: true }),
        ]),
      ])
    );
    const ctaLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(getStartedBreathScale, { toValue: 1.025, duration: 1800, useNativeDriver: true }),
        Animated.timing(getStartedBreathScale, { toValue: 1, duration: 1800, useNativeDriver: true }),
      ])
    );
    const barLoop = Animated.loop(
      Animated.sequence([
        Animated.stagger(180, [
          Animated.timing(dashboardBarOne, { toValue: 1, duration: 720, useNativeDriver: true }),
          Animated.timing(dashboardBarTwo, { toValue: 1, duration: 720, useNativeDriver: true }),
          Animated.timing(dashboardBarThree, { toValue: 1, duration: 720, useNativeDriver: true }),
        ]),
        Animated.stagger(160, [
          Animated.timing(dashboardBarOne, { toValue: 0.68, duration: 760, useNativeDriver: true }),
          Animated.timing(dashboardBarTwo, { toValue: 0.52, duration: 760, useNativeDriver: true }),
          Animated.timing(dashboardBarThree, { toValue: 0.78, duration: 760, useNativeDriver: true }),
        ]),
      ])
    );

    floatLoop.start();
    pulseLoop.start();
    rippleLoop.start();
    decorLoop.start();
    ctaLoop.start();
    barLoop.start();

    return () => {
      floatLoop.stop();
      pulseLoop.stop();
      rippleLoop.stop();
      decorLoop.stop();
      ctaLoop.stop();
      barLoop.stop();
    };
  }, [
    dashboardBarOne,
    dashboardBarThree,
    dashboardBarTwo,
    decorDrift,
    decorOpacity,
    getStartedBreathScale,
    iconFloat,
    iconPulse,
    rippleOpacity,
    rippleScale,
    splashFinished,
  ]);

  const onGetStarted = () => {
    // Animate the person (last screen visual) to fade and move up
    Animated.parallel([
      Animated.timing(personOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(personTranslate, { toValue: -20, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      onFinish && onFinish();
    });
  };

  const animateGetStartedPress = (toValue: number) => {
    Animated.spring(getStartedPressScale, {
      toValue,
      useNativeDriver: true,
      speed: 22,
      bounciness: 4,
    }).start();
  };

  const getFeatureAccent = (decor: string) => {
    if (decor === 'pills') {
      return {
        glow: 'rgba(239, 68, 68, 0.16)',
        inner: '#FEF2F2',
        border: 'rgba(254, 202, 202, 0.95)',
        icon: '#DC2626',
      };
    }
    if (decor === 'dashboard') {
      return {
        glow: 'rgba(34, 211, 238, 0.18)',
        inner: '#ECFEFF',
        border: 'rgba(165, 243, 252, 0.88)',
        icon: '#155E75',
      };
    }
    return {
      glow: 'rgba(14, 165, 233, 0.22)',
      inner: '#E0F2FE',
      border: 'rgba(125, 211, 252, 0.95)',
      icon: '#0284C7',
    };
  };

  const iconFloatStyle: Animated.WithAnimatedValue<ViewStyle> = {
    transform: [
      {
        translateY: iconFloat.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -7],
        }),
      },
    ],
  };

  const iconPulseStyle: Animated.WithAnimatedValue<ViewStyle> = {
    transform: [
      {
        scale: iconPulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.045],
        }),
      },
    ],
  };

  const decorMotionStyle: Animated.WithAnimatedValue<ViewStyle> = {
    opacity: decorOpacity.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.78],
    }),
    transform: [
      {
        translateY: decorDrift.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -8],
        }),
      },
      {
        translateX: decorDrift.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 6],
        }),
      },
    ],
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
              maxFontSizeMultiplier={FONT_SCALE.title}
            >
              IntakeSync
            </Animated.Text>

            {/* Single tagline */}
            <Animated.Text style={[styles.tagline, { opacity: fadeAnim }]} maxFontSizeMultiplier={FONT_SCALE.description}>
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
            <Text style={styles.footerText} maxFontSizeMultiplier={FONT_SCALE.chip}>© {new Date().getFullYear()} IntakeSync</Text>
          </View>
        </ImageBackground>
      </Animated.View>
    );
  }

  // Onboarding screens
  return (
    <View style={styles.bg}>
      {/* Decorative background shapes for onboarding */}
      <Animated.View style={[styles.decorShapeOne, decorMotionStyle]} />
      <Animated.View style={[styles.decorShapeTwo, decorMotionStyle]} />
      <TouchableOpacity
        style={[styles.skipButton, { top: Math.max(insets.top + 10, 24) }]}
        onPress={onFinish}
        activeOpacity={0.82}
      >
        <Text style={styles.skipText} maxFontSizeMultiplier={FONT_SCALE.button}>Skip</Text>
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
        renderItem={({ item }) => {
          const accent = getFeatureAccent(item.bgDecor);
          return (
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
                <Animated.View style={[styles.waveTop, decorMotionStyle]} />
                <Animated.View style={[styles.waveBottom, decorMotionStyle]} />
              </>
            )}
            {item.bgDecor === 'pills' && (
              <>
                <Animated.View style={[styles.pillLarge, decorMotionStyle]} />
                <Animated.View style={[styles.pillSmall, decorMotionStyle]} />
              </>
            )}
            {item.bgDecor === 'dashboard' && (
              <>
                <Animated.View style={[styles.chartBarLeft, decorMotionStyle]} />
                <Animated.View style={[styles.chartBarRight, decorMotionStyle]} />
              </>
            )}

            {/* Content wrapper to center main content */}
            <View style={styles.slideContentWrapper}>
              <Animated.View style={[styles.iconCircle, iconFloatStyle]}>
                {item.bgDecor === 'water' ? (
                  <Animated.View
                    style={[
                      styles.iconRipple,
                      {
                        opacity: rippleOpacity.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 0.26],
                        }),
                        transform: [
                          {
                            scale: rippleScale.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.82, 1.28],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                ) : null}
                <View style={[styles.iconGlowLayer, { backgroundColor: accent.glow }]} />
                <Animated.View style={[styles.iconInnerCircle, { backgroundColor: accent.inner, borderColor: accent.border }, iconPulseStyle]}>
                  {item.bgDecor === 'dashboard' ? (
                    <View style={styles.dashboardIconBars}>
                      {[dashboardBarOne, dashboardBarTwo, dashboardBarThree].map((barAnim, index) => (
                        <Animated.View
                          key={index}
                          style={[
                            styles.dashboardIconBar,
                            index === 0 && styles.dashboardIconBarSmall,
                            index === 2 && styles.dashboardIconBarTall,
                            {
                              transform: [{ scaleY: barAnim }],
                            },
                          ]}
                        />
                      ))}
                    </View>
                  ) : (
                    <Ionicons name={item.icon} size={46} color={accent.icon} />
                  )}
                </Animated.View>
              </Animated.View>
              <Text style={styles.onboardingTitle} maxFontSizeMultiplier={FONT_SCALE.title}>{item.title}</Text>
              <Text style={styles.onboardingDescription} maxFontSizeMultiplier={FONT_SCALE.description}>{item.description}</Text>
              
              {/* Visible progress/next cue */}
              <View style={styles.nextCueRow}>
                {onboardingScreens.map((_, idx) => (
                  <Animated.View
                    key={idx}
                    style={[
                      styles.nextDot,
                      currentPage === idx && styles.nextDotActive,
                    ]}
                  />
                ))}
              </View>

              {/* Last screen: interactive visual + animated button */}
              {item.key === '3' && (
                <View style={styles.lastScreenBlock}>
                  <Text style={styles.lastScreenText} maxFontSizeMultiplier={FONT_SCALE.description}>Create an account to start your journey</Text>
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
                      { scale: getStartedBreathScale },
                      { scale: getStartedPressScale },
                    ],
                    opacity: getStartedScale,
                    marginTop: 20,
                  }}
                >
                  <TouchableOpacity
                    style={styles.getStartedBtnPremium}
                    onPress={onGetStarted}
                    onPressIn={() => animateGetStartedPress(0.96)}
                    onPressOut={() => animateGetStartedPress(1)}
                    activeOpacity={0.88}
                  >
                    <View style={styles.getStartedContent}>
                      <Text style={styles.getStartedTextPremium} maxFontSizeMultiplier={FONT_SCALE.button}>Get Started</Text>
                      <View style={styles.getStartedIconBadge}>
                        <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                      </View>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
                </View>
              )}
            </View>
            </View>
          );
        }}
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
    backgroundColor: 'rgba(255,255,255,0.98)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 8,
    overflow: 'hidden',
  },
  iconGlowLayer: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    opacity: 1,
  },
  iconRipple: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: '#60A5FA',
    backgroundColor: 'rgba(96,165,250,0.14)',
  },
  iconInnerCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dashboardIconBars: {
    width: 44,
    height: 42,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 5,
    borderBottomWidth: 3,
    borderBottomColor: '#155E75',
    paddingBottom: 4,
  },
  dashboardIconBar: {
    width: 8,
    height: 30,
    borderRadius: 4,
    backgroundColor: '#155E75',
  },
  dashboardIconBarSmall: {
    height: 22,
  },
  dashboardIconBarTall: {
    height: 36,
  },
  onboardingTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    minHeight: 38,
  },
  onboardingDescription: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 24,
    minHeight: 48,
    maxWidth: 300,
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
    backgroundColor: '#FFFFFF',
    opacity: 0.35,
  },
  nextDotActive: {
    width: 20,
    opacity: 1,
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
  getStartedBtnPremium: {
    minWidth: 190,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 8,
  },
  getStartedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  getStartedTextPremium: {
    color: '#1E3A8A',
    fontSize: 18,
    fontWeight: '900',
  },
  getStartedIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
