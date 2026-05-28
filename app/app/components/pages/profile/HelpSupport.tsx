import React, { useState } from 'react';
import { Linking, Modal, View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import ThemedNoticeModal from '../../common/ThemedNoticeModal';
import ScreenHeader from '../../common/ScreenHeader';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const SUPPORT_EMAIL = 'intakesyncsupport@gmail.com';
const SUPPORT_SUBJECT = 'IntakeSync Support Request';
const SUPPORT_BODY = [
  'Hello IntakeSync Support,',
  '',
  'I need help with:',
  '',
  'Issue type:',
  '[Account / Beverage Tracking / Medication Reminders / Notifications / Data & Privacy / App Bug / Other]',
  '',
  'Description:',
  '[Please describe what happened.]',
  '',
  'Steps to reproduce:',
  '1.',
  '2.',
  '3.',
  '',
  'Expected result:',
  '[What did you expect to happen?]',
  '',
  'Device information:',
  '- Device model:',
  '- Android version:',
  '- IntakeSync app version:',
  '- Internet connection: Online / Offline',
  '',
  'Attached screenshots:',
  '[Attach screenshots if available.]',
  '',
  'Thank you.',
].join('\r\n');

const PRIVACY_SECTIONS = [
  { title: 'Purpose of IntakeSync', body: 'IntakeSync is a self-monitoring app for beverage intake and medication routine organization.' },
  { title: 'Information Users Provide', body: 'The app may store account information, profile details used for personalization, beverage logs, medication names, dosage, schedules, completion records, reminder preferences, and support messages sent by the user.' },
  { title: 'How Information Is Used', body: 'Information is used to display progress, schedule reminders, summarize routines, support synchronization and account access, and improve app reliability and usability.' },
  { title: 'Manual Entry and Accuracy', body: 'User-entered data may be inaccurate or incomplete. Sugar and caffeine levels are general categories, not exact nutritional measurements.' },
  { title: 'Not Medical Advice', body: 'IntakeSync does not diagnose, treat, prescribe, or replace professional medical advice.' },
  { title: 'Data Storage and Access', body: 'Account-based records may be stored on the device for cache/offline support and on the backend for persistent account features where applicable.' },
  { title: 'Notifications', body: 'Reminders depend on Android permissions, device settings, app settings, battery behavior, and schedules entered by the user.' },
  { title: 'User Choices', body: 'Users can manage records, notifications, account settings, and account/data deletion where available.' },
  { title: 'Contact', body: SUPPORT_EMAIL },
];

const TERMS_SECTIONS = [
  { title: 'Acceptance of Terms', body: 'Using IntakeSync means using it within these terms and app limitations.' },
  { title: 'Purpose of the App', body: 'IntakeSync supports personal beverage logging, medication schedule organization, reminders, and routine summaries.' },
  { title: 'User Responsibilities', body: 'Users are responsible for entering accurate information, verifying medication schedules with a qualified professional or reliable source, and keeping account credentials secure.' },
  { title: 'Not Medical Advice', body: 'IntakeSync does not provide diagnosis, treatment, emergency support, prescriptions, or professional medical advice.' },
  { title: 'App Limitations', body: 'Manual entries may be estimated or inaccurate. Notifications depend on Android permissions, device settings, app settings, battery behavior, and schedules entered by the user. Offline cache and syncing may be delayed. The current version does not use external sensors or medical devices.' },
  { title: 'Prohibited Use', body: 'Do not misuse the app, tamper with it, use another user account, record alcoholic beverages, record or manage illegal, recreational, or controlled-substance use, or bypass unsupported alcohol or drug entry restrictions.' },
  { title: 'Unsupported Substances', body: 'IntakeSync currently excludes alcoholic beverages from beverage tracking and does not support illegal, recreational, or controlled-substance entries in Medication.' },
  { title: 'Account Deletion', body: 'Deletion may remove account data and cannot be undone.' },
  { title: 'Changes and Availability', body: 'The app may be updated and features may change.' },
  { title: 'Contact', body: SUPPORT_EMAIL },
];

export default function HelpSupport() {
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [legalDoc, setLegalDoc] = useState<{ title: string; intro: string; icon: keyof typeof Ionicons.glyphMap; sections: typeof PRIVACY_SECTIONS } | null>(null);

  const openEmailSupport = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(SUPPORT_SUBJECT)}&body=${encodeURIComponent(SUPPORT_BODY)}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        setNotice({ title: 'Email Support', message: `Email app is unavailable. Contact IntakeSync support at ${SUPPORT_EMAIL}.` });
        return;
      }
      await Linking.openURL(url);
    } catch {
      setNotice({ title: 'Email Support', message: `Email app is unavailable. Contact IntakeSync support at ${SUPPORT_EMAIL}.` });
    }
  };

  const showPrivacyPolicy = () => {
    setLegalDoc({
      title: 'IntakeSync Privacy Policy',
      intro: 'A readable summary of how IntakeSync handles self-monitoring data, offline cache, reminders, and user choices.',
      icon: 'information-circle',
      sections: PRIVACY_SECTIONS,
    });
  };

  const showTerms = () => {
    setLegalDoc({
      title: 'IntakeSync Terms of Service',
      intro: 'Terms for using IntakeSync as a personal routine organization and self-monitoring app.',
      icon: 'shield-checkmark-outline',
      sections: TERMS_SECTIONS,
    });
  };

  const faqItems: FAQItem[] = [
    {
      id: '1',
      question: 'What is IntakeSync?',
      answer: 'IntakeSync is a self-monitoring app that helps users log beverage intake, organize medication schedules, receive reminders, and review routine summaries.',
    },
    {
      id: '2',
      question: 'Is IntakeSync a medical app?',
      answer: 'IntakeSync supports personal tracking and organization only. It does not provide diagnosis, treatment, prescriptions, or professional medical advice.',
    },
    {
      id: '3',
      question: 'Can IntakeSync tell me the exact sugar or caffeine amount?',
      answer: 'No. Sugar and caffeine levels are general categories such as none, low, medium, or high. They are not exact nutritional measurements.',
    },
    {
      id: '4',
      question: 'Why did I not receive a reminder?',
      answer: 'Reminders depend on Android notification permission, device settings, battery restrictions, app settings, and the schedule entered by the user.',
    },
    {
      id: '5',
      question: 'Can I use IntakeSync offline?',
      answer: 'Some data can be cached and recorded offline. Changes may sync when an internet connection becomes available.',
    },
    {
      id: '6',
      question: 'Why does my data look delayed?',
      answer: 'The app may show saved local data first while syncing newer updates in the background.',
    },
    {
      id: '7',
      question: 'Can I delete my account and data?',
      answer: 'Yes, if the Delete Account and All Data option is available. The app requires confirmation by typing DELETEACCOUNT because deletion cannot be undone.',
    },
    {
      id: '8',
      question: 'How do I contact support?',
      answer: 'You can contact IntakeSync support at intakesyncsupport@gmail.com.',
    },
    {
      id: '9',
      question: 'Are alcoholic drinks supported?',
      answer: 'No. IntakeSync currently excludes alcoholic beverages from beverage tracking.',
    },
    {
      id: '10',
      question: 'Are illegal, recreational, or controlled-substance entries supported in Medication?',
      answer: 'No. IntakeSync is intended for medication schedule organization only and does not support illegal, recreational, or controlled-substance entries.',
    },
    {
      id: '11',
      question: 'Can IntakeSync connect to sensors or medical devices?',
      answer: 'No. The current version does not collect data from external sensors or medical devices.',
    },
  ];

  const supportChannels = [
    {
      id: '1',
      title: 'Email Support',
      description: SUPPORT_EMAIL,
      icon: 'mail-outline',
      action: openEmailSupport,
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
      <ScreenHeader title="Help & Support" subtitle="Find answers about IntakeSync features and account settings." showBackButton />

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
      <ThemedNoticeModal
        visible={!!notice}
        type="info"
        title={notice?.title || ''}
        message={notice?.message || ''}
        primaryText="OK"
        onPrimary={() => setNotice(null)}
        onClose={() => setNotice(null)}
      />
      <Modal visible={Boolean(legalDoc)} animationType="slide" onRequestClose={() => setLegalDoc(null)}>
        <SafeAreaView style={styles.legalContainer}>
          <View style={styles.legalHeader}>
            <View style={styles.legalIcon}>
              <Ionicons name={legalDoc?.icon || 'document-text-outline'} size={24} color="#2563EB" />
            </View>
            <View style={styles.legalHeaderCopy}>
              <Text style={styles.legalTitle}>{legalDoc?.title}</Text>
              <Text style={styles.legalIntro}>{legalDoc?.intro}</Text>
            </View>
            <TouchableOpacity style={styles.legalCloseButton} onPress={() => setLegalDoc(null)}>
              <Ionicons name="close" size={22} color="#475569" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.legalScroll} contentContainerStyle={styles.legalContent} showsVerticalScrollIndicator={false}>
            {legalDoc?.sections.map((section) => (
              <View style={styles.legalSectionCard} key={section.title}>
                <Text style={styles.legalSectionTitle}>{section.title}</Text>
                <Text style={styles.legalSectionBody}>{section.body}</Text>
              </View>
            ))}
            <TouchableOpacity style={styles.legalDoneButton} onPress={() => setLegalDoc(null)}>
              <Text style={styles.legalDoneText}>Done</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  legalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  legalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  legalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  legalTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'left',
  },
  legalIntro: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 4,
    textAlign: 'left',
  },
  legalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalScroll: {
    flex: 1,
  },
  legalContent: {
    padding: 18,
    paddingBottom: 34,
  },
  legalSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
  },
  legalSectionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 7,
    textAlign: 'left',
  },
  legalSectionBody: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'left',
  },
  legalDoneButton: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  legalDoneText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
