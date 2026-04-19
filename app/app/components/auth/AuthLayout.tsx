import React from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authColors, authStyles } from './authStyles';
import { AuthBackground } from './AuthBackground';

type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  helper?: string;
  iconName?: React.ComponentProps<typeof Ionicons>['name'];
  children: React.ReactNode;
  footer?: React.ReactNode;
  cardStyle?: StyleProp<ViewStyle>;
  headerAnimatedStyle?: StyleProp<ViewStyle>;
  cardAnimatedStyle?: StyleProp<ViewStyle>;
};

export function AuthLayout({
  title,
  subtitle,
  helper,
  iconName,
  children,
  footer,
  cardStyle,
  headerAnimatedStyle,
  cardAnimatedStyle,
}: AuthLayoutProps) {
  return (
    <KeyboardAvoidingView
      style={authStyles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={authStyles.screen}
        contentContainerStyle={authStyles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthBackground />

        <Animated.View style={[authStyles.hero, headerAnimatedStyle]} />

        <Animated.View style={[authStyles.card, cardStyle, cardAnimatedStyle]}>
          <View style={authStyles.cardHeader}>
            {iconName ? (
              <View style={authStyles.iconBadge}>
                <Ionicons name={iconName} size={30} color={authColors.primary} />
              </View>
            ) : null}
            <Text style={authStyles.cardTitle}>{title}</Text>
            {subtitle ? <Text style={authStyles.cardSubtitle}>{subtitle}</Text> : null}
            {helper ? <Text style={authStyles.helperText}>{helper}</Text> : null}
          </View>

          {children}
          {footer}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
