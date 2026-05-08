import React from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FONT_SCALE } from '../../../utils/fontScaling';

export type ThemedNoticeType = 'success' | 'error' | 'warning' | 'info' | 'confirm' | 'destructive';

type Props = {
  visible: boolean;
  type: ThemedNoticeType;
  title: string;
  message: string;
  primaryText?: string;
  secondaryText?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  onClose?: () => void;
  loading?: boolean;
};

const tone = {
  success: { color: '#10B981', bg: '#ECFDF5', icon: 'checkmark-circle' },
  error: { color: '#EF4444', bg: '#FEF2F2', icon: 'alert-circle' },
  warning: { color: '#F59E0B', bg: '#FFFBEB', icon: 'warning' },
  info: { color: '#2563EB', bg: '#EFF6FF', icon: 'information-circle' },
  confirm: { color: '#2563EB', bg: '#EFF6FF', icon: 'help-circle' },
  destructive: { color: '#EF4444', bg: '#FEF2F2', icon: 'trash-outline' },
} as const;

export default function ThemedNoticeModal({
  visible,
  type,
  title,
  message,
  primaryText,
  secondaryText,
  onPrimary,
  onSecondary,
  onClose,
  loading = false,
}: Props) {
  const current = tone[type];
  const showSecondary = type === 'confirm' || type === 'destructive' || !!secondaryText;
  const primaryLabel = primaryText || (showSecondary ? 'Confirm' : 'OK');

  const close = () => {
    if (!loading) onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.card}>
          <View style={[styles.iconBadge, { backgroundColor: current.bg, borderColor: `${current.color}33` }]}>
            <Ionicons name={current.icon} size={28} color={current.color} />
          </View>
          <Text style={styles.title} maxFontSizeMultiplier={FONT_SCALE.title}>{title}</Text>
          <Text style={styles.message} maxFontSizeMultiplier={FONT_SCALE.body}>{message}</Text>
          <View style={styles.actions}>
            {showSecondary ? (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onSecondary || close}
                activeOpacity={0.84}
                disabled={loading}
              >
                <Text style={styles.secondaryText} maxFontSizeMultiplier={FONT_SCALE.button}>{secondaryText || 'Cancel'}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                type === 'destructive' && styles.destructiveButton,
                showSecondary && styles.splitButton,
              ]}
              onPress={onPrimary || close}
              activeOpacity={0.84}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText} maxFontSizeMultiplier={FONT_SCALE.button}>{primaryLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  scroll: {
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    padding: 22,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  iconBadge: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#0F172A',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  splitButton: {
    flex: 1,
  },
  destructiveButton: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryText: {
    color: '#1E3A8A',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
});
