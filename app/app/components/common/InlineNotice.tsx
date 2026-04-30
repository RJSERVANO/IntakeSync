import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

type InlineNoticeProps = {
  visible: boolean;
  message: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  top?: number;
  type?: 'success' | 'info' | 'warning' | 'error';
};

const NOTICE_COLORS = {
  success: '#2563EB',
  info: '#2563EB',
  warning: '#F59E0B',
  error: '#EF4444',
};

export default function InlineNotice({
  visible,
  message,
  iconName = 'checkmark-circle',
  top,
  type = 'success',
}: InlineNoticeProps) {
  if (!visible || !message) return null;

  return (
    <View pointerEvents="none" style={[styles.notice, { backgroundColor: NOTICE_COLORS[type] }, top !== undefined && { top }]}>
      <Ionicons name={iconName} size={16} color="#FFFFFF" />
      <Text style={styles.noticeText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 60,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
  },
  noticeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
