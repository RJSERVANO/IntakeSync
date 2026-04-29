import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export default function HelpSupport() {
  const insets = useSafeAreaInsets();
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

  const showPrivacyPolicy = () => {
    Alert.alert(
      'IntakeSync Privacy Policy',
      'IntakeSync is a self-monitoring app for beverage tracking, hydration goals, and medication reminder support.\n\nIt may store account/profile information and app activity needed for app features. Data is used to support functionality such as reminders, summaries, and preferences.\n\nIntakeSync does not provide medical diagnosis, treatment, or professional medical advice. Users are responsible for reviewing medication instructions from healthcare professionals.'
    );
  };

  const showTerms = () => {
    Alert.alert(
      'IntakeSync Terms of Service',
      'IntakeSync is for personal organization and self-monitoring. It does not replace professional healthcare advice.\n\nUsers should consult a qualified professional for medical concerns and are responsible for the accuracy of information they enter.\n\nReminder notifications may depend on device permissions and settings and may not always be delivered. Use of the app means accepting these limitations.'
    );
  };

  const faqItems: FAQItem[] = [
    {
      id: '1',
      question: 'How do I add medications?',
      answer: 'Open the Medication tab and add the medicine details and reminder schedule you want to track.',
    },
    {
      id: '2',
      question: 'How do I track beverages?',
      answer: 'Open the Beverage tab, choose a beverage type, and log the amount you drank.',
    },
    {
      id: '3',
      question: 'How is my hydration goal shown?',
      answer: 'Your hydration goal appears in hydration-related screens and can be adjusted from your profile information when supported.',
    },
    {
      id: '4',
      question: 'How do notifications work?',
      answer: 'Open Profile > Notifications to allow notifications and choose which reminder preferences to keep on. Reminder delivery depends on device permission and the existing reminder setup.',
    },
    {
      id: '5',
      question: 'How do I edit my profile?',
      answer: 'Open Profile > Personal Information, then tap the edit icon to update account and hydration profile details.',
    },
    {
      id: '6',
      question: 'How do I change my password?',
      answer: 'Open Profile > Privacy & Security and choose Change Password.',
    },
  ];

  const supportChannels = [
    {
      id: '1',
      title: 'Email Support',
      description: 'support@intakesync.local',
      icon: 'mail-outline',
      action: () => Alert.alert('Info', 'Email support is not available yet.'),
    },
    {
      id: '2',
      title: 'Privacy Policy',
      description: 'Information page',
      icon: 'document-text-outline',
      action: showPrivacyPolicy,
    },
    {
      id: '3',
      title: 'Terms of Service',
      description: 'Information page',
      icon: 'shield-checkmark-outline',
      action: showTerms,
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Help & Support</Text>
          <Text style={styles.subtitle}>Find answers about IntakeSync features and account settings.</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.card}>
          {supportChannels.map((channel, index) => (
            <TouchableOpacity key={channel.id} style={styles.supportRow} onPress={channel.action}>
              <View style={styles.supportIcon}>
                <Ionicons name={channel.icon as any} size={20} color="#2563EB" />
              </View>
              <View style={styles.supportContent}>
                <Text style={styles.supportTitle}>{channel.title}</Text>
                <Text style={styles.supportDescription}>{channel.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
              {index < supportChannels.length - 1 ? <View style={styles.absoluteDivider} /> : null}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionTitle, styles.faqTitle]}>Frequently Asked Questions</Text>
        {faqItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.faqItem}
            onPress={() => setExpandedFAQ(expandedFAQ === item.id ? null : item.id)}
          >
            <View style={styles.faqHeader}>
              <Text style={styles.faqQuestion}>{item.question}</Text>
              <Ionicons
                name={expandedFAQ === item.id ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#2563EB"
              />
            </View>
            {expandedFAQ === item.id ? <Text style={styles.faqAnswer}>{item.answer}</Text> : null}
          </TouchableOpacity>
        ))}

        <View style={styles.versionCard}>
          <Text style={styles.versionText}>IntakeSync</Text>
          <Text style={styles.buildText}>App Version 1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 56,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 22,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
  },
  subtitle: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  supportIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportContent: {
    flex: 1,
    minWidth: 0,
  },
  supportTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  supportDescription: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  absoluteDivider: {
    position: 'absolute',
    left: 70,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  faqTitle: {
    marginTop: 24,
  },
  faqItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 7,
    elevation: 1,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 20,
  },
  faqAnswer: {
    fontSize: 14,
    color: '#475569',
    marginTop: 12,
    lineHeight: 20,
    fontWeight: '600',
  },
  versionCard: {
    alignItems: 'center',
    paddingVertical: 22,
  },
  versionText: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '900',
  },
  buildText: {
    marginTop: 4,
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '700',
  },
});
