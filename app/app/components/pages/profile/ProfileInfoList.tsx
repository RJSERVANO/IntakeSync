import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Row {
  label: string;
  value?: string | number | null;
}

interface Section {
  title?: string;
  rows: Row[];
}

export default function ProfileInfoList({ sections }: { sections: Section[] }) {
  return (
    <>
      {sections.map((section, si) => (
        <View key={si} style={styles.section}>
          {section.title ? (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          ) : null}

          <View style={styles.card}>
            {section.rows.map((r, idx) => (
              <View key={idx}>
                <View style={styles.row}>
                  <Text style={styles.label}>{r.label}</Text>
                  <Text style={styles.value}>{r.value ?? 'Not set'}</Text>
                </View>
                {idx < section.rows.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 13,
  },
  label: {
    flex: 0.42,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
  },
  value: {
    flex: 0.58,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '800',
    textAlign: 'right',
    lineHeight: 20,
    flexWrap: 'wrap',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
  },
});
