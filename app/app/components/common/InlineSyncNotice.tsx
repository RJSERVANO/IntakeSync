import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

type InlineSyncNoticeVariant = 'sync' | 'info' | 'warning';

type InlineSyncNoticeProps = {
  visible?: boolean;
  message: string;
  icon?: React.ReactNode;
  iconName?: keyof typeof Ionicons.glyphMap;
  top?: number;
  variant?: InlineSyncNoticeVariant;
};

const VARIANTS: Record<InlineSyncNoticeVariant, { bg: string; border: string; text: string; icon: string }> = {
  sync: { bg: '#DBEAFE', border: '#BFDBFE', text: '#1E3A8A', icon: '#1E3A8A' },
  info: { bg: '#DBEAFE', border: '#BFDBFE', text: '#1E3A8A', icon: '#1E3A8A' },
  warning: { bg: '#FEF3C7', border: '#FDE68A', text: '#92400E', icon: '#92400E' },
};

export default function InlineSyncNotice({
  visible = true,
  message,
  icon,
  iconName = 'sync-outline',
  top,
  variant = 'sync',
}: InlineSyncNoticeProps) {
  if (!visible || !message) return null;

  const colors = VARIANTS[variant];

  return (
    <View
      pointerEvents="none"
      style={[
        styles.notice,
        { backgroundColor: colors.bg, borderColor: colors.border },
        top !== undefined && { top },
      ]}
    >
      {icon || <Ionicons name={iconName} size={15} color={colors.icon} />}
      <Text style={[styles.noticeText, { color: colors.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 55,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
  },
  noticeText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
