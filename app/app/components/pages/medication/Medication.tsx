import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Platform, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BottomNavigation from '../../navigation/BottomNavigation';
import * as api from '../../../api';
import { useLocalSearchParams } from 'expo-router';
import { notificationManager } from '../../../../services/notificationManager';

type MedicationItem = {
  id: string;
  name: string;
  dosage: string;
  times: string[]; // ISO timestamps (time-of-day represented as ISO strings)
  reminder: boolean;
  start_date?: string;
  end_date?: string | null;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'custom';
  days_of_week?: number[];
  notes?: string;
  color?: string;
  otc_medicine_id?: number | string | null;
  otc_metadata?: any;
};

type OtcMedicineSuggestion = {
  id?: number | string;
  name: string;
  generic_name?: string;
  brand?: string;
  category?: string;
  description?: string;
  common_use?: string;
  dosage?: string;
  dosage_text?: string;
  interval_hours?: number | string | null;
  max_daily_doses?: number | string | null;
  frequency?: string;
  timing_instructions?: string;
  warnings?: string;
};

type HistoryEntry = {
  id: string;
  medId: string;
  time: string; // ISO
  status: 'completed' | 'skipped' | 'missed' | 'snoozed';
  loggedAt?: string;
};

type ThemedPopup = {
  title: string;
  message: string;
  tone: 'info' | 'warning' | 'error';
  icon: keyof typeof Ionicons.glyphMap;
};

const STORAGE_KEYS = {
  MEDS: '@aqua:medications',
  HISTORY: '@aqua:med_history',
  CLEARED_HISTORY: '@aqua:med_history_cleared_keys',
};

const LATE_GRACE_MS = 30 * 60 * 1000;
const SNOOZE_DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const OTC_SAFETY_COPY = 'Use only as directed on the label. This app does not provide medical advice. Consult a healthcare professional if symptoms persist or you are unsure.';

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function todayDateString() {
  return toDateStringLocal(new Date());
}

function toDateStringLocal(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateStringLocal(dateString?: string | null) {
  if (!dateString) return new Date();
  const [year, month, day] = dateString.slice(0, 10).split('-').map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
}

function formatDateLabel(dateString?: string | null) {
  if (!dateString) return '';
  return dateString === todayDateString() ? 'Today' : dateString;
}

function formatCalendarTitle(date: Date) {
  return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

function formatDateDetail(dateString?: string | null) {
  if (!dateString) return 'No end date';
  const date = parseDateStringLocal(dateString);
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function buildCalendarDays(monthDate: Date) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const firstGridDay = new Date(firstOfMonth);
  firstGridDay.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDay);
    date.setDate(firstGridDay.getDate() + index);
    return date;
  });
}

function roundToNextMinutes(date: Date, increment = 15) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();
  const nextMinutes = Math.ceil(minutes / increment) * increment;
  if (nextMinutes === 60) {
    rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
  } else {
    rounded.setMinutes(nextMinutes);
  }
  return rounded;
}

function inferScheduleFromText(text = '', frequency?: string) {
  const lower = text.toLowerCase();
  const everyMatch = lower.match(/every\s+(\d+)\s*(?:hour|hr)/);
  const maxDosesMatch = lower.match(/(?:max|maximum)\s+(\d+)/);
  let intervalHours = everyMatch ? Number(everyMatch[1]) : undefined;
  let maxDosesToday = maxDosesMatch ? Number(maxDosesMatch[1]) : undefined;

  if (!intervalHours) {
    if (lower.includes('twice') || lower.includes('2 times') || frequency === 'twice_daily') intervalHours = 12;
    else if (lower.includes('three times') || lower.includes('3 times') || frequency === 'three_times_daily') intervalHours = 8;
    else if (lower.includes('four times') || lower.includes('4 times') || frequency === 'four_times_daily') intervalHours = 6;
    else if (lower.includes('once') || lower.includes('daily') || frequency === 'once_daily') intervalHours = 24;
  }

  if (!maxDosesToday) {
    if (frequency === 'once_daily' || intervalHours === 24) maxDosesToday = 1;
    else if (frequency === 'twice_daily' || intervalHours === 12) maxDosesToday = 2;
    else if (frequency === 'three_times_daily' || intervalHours === 8) maxDosesToday = 3;
    else if (frequency === 'four_times_daily' || intervalHours === 6) maxDosesToday = 4;
  }

  return {
    intervalHours: intervalHours || 24,
    maxDosesToday: Math.max(1, Math.min(maxDosesToday || 1, 6)),
  };
}

function generateSuggestedTimes({
  startTime,
  intervalHours,
  maxDosesToday,
  frequency,
}: {
  startTime: Date;
  intervalHours?: number | string | null;
  maxDosesToday?: number | string | null;
  frequency?: string;
}) {
  const inferred = inferScheduleFromText('', frequency);
  const interval = Number(intervalHours || inferred.intervalHours || 24);
  const maxDoses = Math.max(1, Math.min(Number(maxDosesToday || inferred.maxDosesToday || 1), 6));
  const first = roundToNextMinutes(startTime);
  const seen = new Set<string>();
  const times: string[] = [];

  for (let index = 0; index < maxDoses; index += 1) {
    const candidate = new Date(first);
    candidate.setHours(first.getHours() + index * interval);
    const key = `${candidate.getHours()}:${candidate.getMinutes()}`;
    if (!seen.has(key)) {
      seen.add(key);
      times.push(candidate.toISOString());
    }
  }

  return times;
}

function buildTimesForMedicine(medicine: OtcMedicineSuggestion, startTime = new Date()) {
  const guidanceText = [
    medicine.dosage_text,
    medicine.dosage,
    medicine.timing_instructions,
  ].filter(Boolean).join(' ');
  const inferred = inferScheduleFromText(guidanceText, medicine.frequency);

  return generateSuggestedTimes({
    startTime,
    intervalHours: medicine.interval_hours || inferred.intervalHours,
    maxDosesToday: medicine.max_daily_doses || inferred.maxDosesToday,
    frequency: medicine.frequency,
  });
}

function normalizeMedication(med: any, fallbackColor?: string): MedicationItem {
  return {
    ...med,
    id: med.id.toString(),
    color: med.color || fallbackColor || '#1E3A8A',
  };
}

function normalizeHistoryEntry(entry: any, medId: string): HistoryEntry {
  return {
    id: entry.id?.toString() || uid(),
    medId: medId.toString(),
    time: entry.time,
    status: entry.status,
    loggedAt: entry.logged_at || entry.taken_time || entry.taken_at || entry.completed_at || entry.created_at || entry.updated_at,
  };
}

export default function Medication() {
  const { token, medicineName, medicineDosage, medicineData } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [meds, setMeds] = useState<MedicationItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<MedicationItem | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [medicineSuggestions, setMedicineSuggestions] = useState<any[]>([]);
  const [showMedicineSuggestions, setShowMedicineSuggestions] = useState(false);
  const [selectedOtcMedicine, setSelectedOtcMedicine] = useState<OtcMedicineSuggestion | null>(null);
  const [lastClearedTime, setLastClearedTime] = useState<number>(0);
  const [clearedHistoryKeys, setClearedHistoryKeys] = useState<string[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [statsModalType, setStatsModalType] = useState<'total' | 'active' | 'today' | 'missed' | null>(null);
  const [busyActions, setBusyActions] = useState<Record<string, boolean>>({});
  const [headerElevated, setHeaderElevated] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [deleteTarget, setDeleteTarget] = useState<MedicationItem | null>(null);
  const [themedPopup, setThemedPopup] = useState<ThemedPopup | null>(null);
  const shownReminderPopups = useRef<Set<string>>(new Set());

  // form state
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [times, setTimes] = useState<string[]>([]);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  // Advanced scheduling state
  const [startDate, setStartDate] = useState(todayDateString());
  const [endDate, setEndDate] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState('#1E3A8A');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(parseDateStringLocal(todayDateString()));
  const [tempStartDate, setTempStartDate] = useState(todayDateString());
  const [tempEndDate, setTempEndDate] = useState('');
  const [tempActiveDateField, setTempActiveDateField] = useState<'start' | 'end'>('start');
  // Time picker modal state
  const [tempTime, setTempTime] = useState<Date | null>(null);
  const [timeModalVisible, setTimeModalVisible] = useState(false);
  const MODAL_ANIM = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (timeModalVisible) {
      Animated.timing(MODAL_ANIM, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else {
      Animated.timing(MODAL_ANIM, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    }
  }, [timeModalVisible, MODAL_ANIM]);
  const [reminder, setReminder] = useState(true);

  // Medicine autocomplete search
  useEffect(() => {
    const searchMedicines = async () => {
      if (name.trim().length < 2) {
        setMedicineSuggestions([]);
        setShowMedicineSuggestions(false);
        return;
      }

      try {
        const response = await api.get(`/medicines/search?query=${encodeURIComponent(name)}`);
        setMedicineSuggestions(response.medicines || []);
        setShowMedicineSuggestions(true);
      } catch (err) {
        console.log('Medicine search error:', err);
        setMedicineSuggestions([]);
      }
    };

    const debounceTimer = setTimeout(searchMedicines, 300);
    return () => clearTimeout(debounceTimer);
  }, [name]);

  useEffect(() => {
    (async () => {
      try {
        const [clearedTime, clearedKeys] = await Promise.all([
          AsyncStorage.getItem('medication_history_cleared_time'),
          AsyncStorage.getItem(STORAGE_KEYS.CLEARED_HISTORY),
        ]);
        if (clearedTime) setLastClearedTime(parseInt(clearedTime, 10));
        if (clearedKeys) setClearedHistoryKeys(JSON.parse(clearedKeys));
      } catch (error) {
        console.log('Error loading history clear markers:', error);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        if (token) {
          const localRaw = await AsyncStorage.getItem(STORAGE_KEYS.MEDS);
          const localMeds: MedicationItem[] = localRaw ? JSON.parse(localRaw) : [];
          const localColorById = new Map(localMeds.map((med) => [med.id.toString(), med.color]));

          // load from backend
          const serverMeds: any[] = await api.get('/medications', token as string);
          // Ensure all IDs are strings for consistency
          const normalizedMeds = (serverMeds || []).map(m => normalizeMedication(m, localColorById.get(m.id.toString())));
          setMeds(normalizedMeds);

          // Load everything in parallel for better performance
          const [historyResults, statsData, upcomingData] = await Promise.allSettled([
            // Load all medication histories in parallel
            Promise.all((serverMeds || []).map(async (m) => {
              try {
                const h = await api.get(`/medications/${m.id}/history`, token as string);
                return (h || []).map((hh: any) => normalizeHistoryEntry(hh, m.id.toString()));
              } catch {
                return [];
              }
            })),
            // Load stats
            api.get('/medications/stats', token as string),
            // Load upcoming
            api.get('/medications/upcoming', token as string)
          ]);

          // Set history from parallel results
          if (historyResults.status === 'fulfilled') {
            const allHistory = historyResults.value.flat();
            console.log('Initial history loaded:', allHistory.length, 'entries');
            setHistory(allHistory);
          } else {
            console.log('Failed to load history:', historyResults.reason);
          }

          // Load last cleared timestamp
          try {
            const clearedTime = await AsyncStorage.getItem('medication_history_cleared_time');
            if (clearedTime) {
              setLastClearedTime(parseInt(clearedTime, 10));
            }
            const clearedKeys = await AsyncStorage.getItem(STORAGE_KEYS.CLEARED_HISTORY);
            if (clearedKeys) {
              setClearedHistoryKeys(JSON.parse(clearedKeys));
            }
          } catch (error) {
            console.log('Error loading cleared time:', error);
          }

          // Set stats
          if (statsData.status === 'fulfilled') {
            setStats(statsData.value || {
              total_medications: 0,
              active_medications: 0,
              completed_today: 0,
              missed_today: 0
            });
          } else {
            setStats({
              total_medications: 0,
              active_medications: 0,
              completed_today: 0,
              missed_today: 0
            });
          }

          // Set upcoming
          if (upcomingData.status === 'fulfilled') {
            setUpcoming(upcomingData.value || []);
          }
        } else {
          const raw = await AsyncStorage.getItem(STORAGE_KEYS.MEDS);
          const hraw = await AsyncStorage.getItem(STORAGE_KEYS.HISTORY);
          if (raw) setMeds(JSON.parse(raw));
          if (hraw) setHistory(JSON.parse(hraw));
        }
      } catch {
        console.log('Failed to load meds');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Persist medications to local storage
  useEffect(() => {
    const saveMeds = async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.MEDS, JSON.stringify(meds));
      } catch (error) {
        console.log('Error saving medications:', error);
      }
    };

    if (meds.length > 0) {
      saveMeds();
    }
  }, [meds]);

  // Persist history to local storage
  useEffect(() => {
    const saveHistory = async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
      } catch (error) {
        console.log('Error saving history:', error);
      }
    };

    if (history.length > 0) {
      saveHistory();
    }
  }, [history]);

  // Handle medicine pre-fill from home search
  useEffect(() => {
    if (medicineName && !modalVisible) {
      // Open add modal with pre-filled data
      openAdd();
      setName(medicineName as string);
      if (medicineDosage) {
        setDosage(medicineDosage as string);
      }
      if (medicineData) {
        try {
          const data = JSON.parse(medicineData as string);
          const selectedMedicine = data as OtcMedicineSuggestion;
          setSelectedOtcMedicine(selectedMedicine);
          const recommendedTimes = buildTimesForMedicine(selectedMedicine);
          if (recommendedTimes.length > 0) setTimes(recommendedTimes);
        } catch (e) {
          console.log('Error parsing medicine data:', e);
        }
      }
    }
  }, [medicineName, medicineDosage, medicineData, modalVisible]);

  // Auto-mark missed medications and reload stats periodically
  useEffect(() => {
    if (!token || meds.length === 0) return;

    const checkAndReload = async () => {
      try {
        // Reload stats which will auto-mark missed medications on backend
        const statsData = await api.get('/medications/stats', token as string);
        setStats(statsData);

        // Reload history to get any new missed entries
        const allHistory: HistoryEntry[] = [];
        for (const m of meds) {
          try {
            const h = await api.get(`/medications/${m.id}/history`, token as string);
            (h || []).forEach((hh:any) => {
              allHistory.push(normalizeHistoryEntry(hh, m.id.toString()));
            });
          } catch {
            // ignore per-med history errors
          }
        }
        setHistory(allHistory);
      } catch (e) {
        console.log('Failed to reload stats/history:', e);
      }
    };

    // Check immediately
    checkAndReload();

    // Check every 5 minutes
    const interval = setInterval(checkAndReload, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [token, meds]);

  function openAdd() {
    console.log('Medication: openAdd called');
    setEditing(null);
    setName('');
    setDosage('');
    setTimes([]);
    setSelectedOtcMedicine(null);
    setReminder(true);
    setStartDate(todayDateString());
    setEndDate('');
    setFrequency('daily');
    setDaysOfWeek([]);
    setNotes('');
    setColor('#1E3A8A');
    setModalVisible(true);
  }

  function openEdit(m: MedicationItem) {
    const current = meds.find((item) => item.id === m.id) || m;
    setEditing({ ...current });
    setName(current.name);
    setDosage(current.dosage);
    setTimes([...(current.times || [])]);
    setSelectedOtcMedicine(current.otc_metadata || null);
    setReminder(!!current.reminder);
    setStartDate(current.start_date || todayDateString());
    setEndDate(current.end_date || '');
    setFrequency(current.frequency || 'daily');
    setDaysOfWeek([...(current.days_of_week || [])]);
    setNotes(current.notes || '');
    setColor(current.color || '#1E3A8A');
    setModalVisible(true);
  }

  async function saveMedication() {
    if (!name.trim()) return Alert.alert('Validation', 'Please enter a name');
    if (!times.length) return Alert.alert('Validation', 'Please add at least one reminder time');
    const originalStart = editing?.start_date ? toDateStringLocal(parseDateStringLocal(editing.start_date)) : '';
    const startChanged = !editing || (startDate || todayDateString()) !== originalStart;
    if (startChanged && parseDateStringLocal(startDate || todayDateString()).getTime() < parseDateStringLocal(todayDateString()).getTime()) {
      return Alert.alert('Validation', 'Start date cannot be in the past. Please select today or a future date.');
    }
    if (endDate && parseDateStringLocal(endDate).getTime() < parseDateStringLocal(startDate || todayDateString()).getTime()) {
      return Alert.alert('Validation', 'End date cannot be before the start date.');
    }

    const medData = {
      name,
      dosage,
      times,
      reminder,
      start_date: startDate || todayDateString(),
      end_date: endDate || null,
      frequency,
      days_of_week: daysOfWeek,
      notes,
      color,
      otc_medicine_id: selectedOtcMedicine?.id || null,
      otc_metadata: selectedOtcMedicine ? {
        name: selectedOtcMedicine.name,
        generic_name: selectedOtcMedicine.generic_name || null,
        category: selectedOtcMedicine.category || null,
        dosage_text: selectedOtcMedicine.dosage_text || selectedOtcMedicine.dosage || null,
        interval_hours: selectedOtcMedicine.interval_hours || null,
        max_daily_doses: selectedOtcMedicine.max_daily_doses || null,
        warnings: selectedOtcMedicine.warnings || OTC_SAFETY_COPY,
        is_otc: true,
      } : null,
    };

    if (editing) {
      // Update existing medication
      const updatedMed: MedicationItem = { ...editing, ...medData };
      setMeds((s) => s.map((x) => (x.id === updatedMed.id ? updatedMed : x)));

      if (token) {
        try {
          await api.put(`/medications/${editing.id}`, medData, token as string);
          // Schedule medication reminders
          await scheduleMedicationReminders(updatedMed);
          // Reload all data from server
          await reloadAllData({ [editing.id]: color });
        } catch (err) {
          console.log('Failed to update on server:', err);
          Alert.alert('Warning', 'Medication saved locally but failed to sync with server');
        }
      }
    } else {
      // Create new medication
      if (token) {
        try {
          // Save to server first to get proper ID
          const serverMed = await api.post('/medications', medData, token as string);
          const newMed: MedicationItem = {
            id: serverMed.id.toString(),
            ...medData,
            color: serverMed.color || medData.color,
          };
          setMeds((s) => [newMed, ...s]);
          // Schedule medication reminders
          await scheduleMedicationReminders(newMed);
          // Reload all data from server
          await reloadAllData({ [newMed.id]: newMed.color });
        } catch (err: any) {
          console.log('Failed to save to server:', err);
          Alert.alert('Error', err?.data?.message || 'Failed to save medication. Please try again.');
          return;
        }
      } else {
        // Offline mode - use local ID
        const newMed: MedicationItem = { id: uid(), ...medData };
        setMeds((s) => [newMed, ...s]);
      }
    }
    setModalVisible(false);
  }

  async function scheduleMedicationReminders(medication: MedicationItem) {
    if (!medication.reminder) {
      // If reminder is disabled, cancel existing reminders
      if (medication.id) {
        notificationManager.cancelAllReminders('medication');
      }
      return;
    }

    try {
      // Schedule in-app reminders for each time
      medication.times.forEach((timeStr) => {
        const targetTime = new Date(timeStr);
        const now = new Date();

        // If time is in the past today, schedule for tomorrow
        if (targetTime < now) {
          targetTime.setDate(targetTime.getDate() + 1);
        }

        // Schedule reminder
        notificationManager.scheduleMedicationReminder(targetTime, () => {
          showMedicationReminderPopup(medication, targetTime);
        });
      });
    } catch (error) {
      console.error('Error scheduling medication reminders:', error);
    }
  }

  function showThemedPopup(popup: ThemedPopup) {
    setThemedPopup(popup);
  }

  function showMedicationReminderPopup(medication: MedicationItem, reminderTime: Date) {
    const timeLabel = reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const reminderKey = `${medication.id}:${reminderTime.toISOString()}`;
    if (shownReminderPopups.current.has(reminderKey)) return;

    shownReminderPopups.current.add(reminderKey);
    showThemedPopup({
      title: 'Medication Reminder',
      message: `${medication.name}${medication.dosage ? ` - ${medication.dosage}` : ''}\nScheduled for ${timeLabel}.`,
      tone: 'info',
      icon: 'medkit-outline',
    });
  }

  async function reloadStatsAndUpcoming() {
    if (!token) return;
    try {
      const [statsData, upcomingData] = await Promise.all([
        api.get('/medications/stats', token as string),
        api.get('/medications/upcoming', token as string)
      ]);
      setStats(statsData || {
        total_medications: 0,
        active_medications: 0,
        completed_today: 0,
        missed_today: 0
      });
      setUpcoming(upcomingData || []);
    } catch (e) {
      console.log('Failed to reload stats/upcoming:', e);
    }
  }

  async function reloadAllData(colorFallbacks: Record<string, string | undefined> = {}) {
    if (!token) return;
    try {
      const [medsData, historyResults, statsData, upcomingData] = await Promise.allSettled([
        api.get('/medications', token as string),
        // Load histories
        (async () => {
          const serverMeds: any[] = await api.get('/medications', token as string);
          console.log('Loading history for', serverMeds.length, 'medications');
          return Promise.all((serverMeds || []).map(async (m) => {
            try {
              const h = await api.get(`/medications/${m.id}/history`, token as string);
              console.log(`Medication ${m.id} (${m.name}): ${h.length} history entries`);
              const entries = (h || []).map((hh: any) => normalizeHistoryEntry(hh, m.id.toString()));
              return entries;
            } catch (err) {
              console.log(`Failed to load history for medication ${m.id}:`, err);
              return [];
            }
          }));
        })(),
        api.get('/medications/stats', token as string),
        api.get('/medications/upcoming', token as string)
      ]);

      // Update medications
      if (medsData.status === 'fulfilled') {
        // Ensure all IDs are strings for consistency
        const normalizedMeds = (medsData.value || []).map((m: any) => {
          const id = m.id.toString();
          const existingColor = meds.find((med) => med.id.toString() === id)?.color;
          return normalizeMedication(m, colorFallbacks[id] || existingColor);
        });
        setMeds(normalizedMeds);
      }

      // Update history
      if (historyResults.status === 'fulfilled') {
        const allHistory = historyResults.value.flat();
        console.log('Reloaded history:', allHistory.length, 'entries');
        console.log('Sample entries:', allHistory.slice(0, 3));
        setHistory(allHistory);
      } else {
        console.log('Failed to reload history:', historyResults.reason);
      }

      // Update stats
      if (statsData.status === 'fulfilled') {
        setStats(statsData.value || {
          total_medications: 0,
          active_medications: 0,
          completed_today: 0,
          missed_today: 0
        });
      }

      // Update upcoming
      if (upcomingData.status === 'fulfilled') {
        setUpcoming(upcomingData.value || []);
      }
    } catch (e) {
      console.log('Failed to reload all data:', e);
    }
  }

  function deleteMedication(id: string) {
    const actionKey = `delete:${id}`;
    if (busyActions[actionKey]) return;
    const medToDelete = meds.find((med) => med.id === id);
    if (!medToDelete) return;

    setDeleteTarget(medToDelete);
  }

  async function confirmDeleteMedication() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const actionKey = `delete:${id}`;
    if (busyActions[actionKey]) return;

    setActionBusy(actionKey, true);
    notificationManager.cancelAllReminders('medication');

    const previous = meds;
    const previousHistory = history;
    const newMeds = previous.filter((m) => m.id !== id);
    const newHistory = previousHistory.filter((entry) => entry.medId.toString() !== id.toString());
    setMeds(newMeds);
    setHistory(newHistory);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.MEDS, JSON.stringify(newMeds));
      await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(newHistory));
    } catch {
      setMeds(previous);
      setHistory(previousHistory);
      Alert.alert('Delete failed', 'Could not update local storage. Please try again.');
      setActionBusy(actionKey, false);
      return;
    }

    let deleted = true;
    if (token) {
      deleted = await performServerDelete(id, previous, newMeds, previousHistory);
    }

    if (deleted) {
      setDeleteTarget(null);
      notificationManager.showCustomNotification('Deleted', `${deleteTarget.name} was removed from your schedule.`, 'toast', 'low');
    }
    setActionBusy(actionKey, false);
  }

  // Helper: attempt server deletion and provide richer error handling / retry
  async function performServerDelete(id: string, previous: MedicationItem[], newMeds: MedicationItem[], previousHistory: HistoryEntry[]): Promise<boolean> {
    try {
      await api.del(`/medications/${id}`, token as string);
      // Reload all data from server after successful deletion
      await reloadAllData();
      return true;
    } catch (err: any) {
      const status = err?.status;

      // If medication doesn't exist on server (404), just keep local deletion
      if (status === 404) {
        console.log('Medication not found on server, keeping local deletion');
        // Medication is already deleted locally, just sync with server to get fresh list
        try {
          await reloadAllData();
        } catch {
          // If can't sync with server, keep the local deletion
          console.log('Could not sync with server after 404, keeping local state');
        }
        return true;
      }

      // For other errors, revert and notify user
      setMeds(previous);
      setHistory(previousHistory);
      try { await AsyncStorage.setItem(STORAGE_KEYS.MEDS, JSON.stringify(previous)); } catch {}
      try { await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(previousHistory)); } catch {}

      console.log('performServerDelete error raw:', err);
      const data = err?.data;
      const serverMsg = (data && (data.message || (typeof data === 'string' ? data : JSON.stringify(data)))) || err?.message || 'Could not delete the medication on the server. Please try again.';

      const fullMsg = status ? `Server ${status}: ${serverMsg}` : serverMsg;

      Alert.alert('Delete failed', fullMsg, [
        { text: 'Retry', onPress: async () => {
            // re-apply optimistic delete then retry server call
            setMeds(newMeds);
            try { await AsyncStorage.setItem(STORAGE_KEYS.MEDS, JSON.stringify(newMeds)); } catch {}
            const retried = await performServerDelete(id, previous, newMeds, previousHistory);
            if (retried) setDeleteTarget(null);
          }
        },
        { text: 'OK', style: 'cancel' }
      ]);
      console.log('performServerDelete error', err);
      return false;
    }
  }


  function removeTime(idx: number) {
    setTimes((t) => t.filter((_, i) => i !== idx));
  }

  function getTimeKey(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value);
    return `${date.getHours()}:${date.getMinutes()}`;
  }

  function sortTimesChronologically(values: string[]) {
    return [...values].sort((a, b) => {
      const first = new Date(a);
      const second = new Date(b);
      return (first.getHours() * 60 + first.getMinutes()) - (second.getHours() * 60 + second.getMinutes());
    });
  }

  function formatReminderTime(date: Date) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  function setTempTimeParts(nextParts: { hour24?: number; minute?: number }) {
    const current = tempTime || new Date();
    const next = new Date(current);
    if (typeof nextParts.hour24 === 'number') next.setHours(nextParts.hour24);
    if (typeof nextParts.minute === 'number') next.setMinutes(nextParts.minute);
    next.setSeconds(0, 0);
    setTempTime(next);
  }

  function addOrUpdateReminderTime(date: Date) {
    if (!date || Number.isNaN(date.getTime())) {
      Alert.alert('Validation', 'Please select a valid reminder time.');
      return false;
    }

    const nextIso = date.toISOString();
    const nextKey = getTimeKey(date);
    const duplicateIndex = times.findIndex((time, index) => index !== pickerIndex && getTimeKey(time) === nextKey);

    if (duplicateIndex >= 0) {
      Alert.alert('Duplicate time', `${formatReminderTime(date)} is already in your reminder list.`);
      return false;
    }

    const nextTimes = pickerIndex === null
      ? [...times, nextIso]
      : times.map((time, index) => index === pickerIndex ? nextIso : time);

    setTimes(sortTimesChronologically(nextTimes));
    setPickerIndex(null);
    return true;
  }

  function openScheduleSheet(activeField: 'start' | 'end' = 'start') {
    const draftStart = startDate || todayDateString();
    const draftEnd = endDate || '';
    const selectedDate = activeField === 'start' ? draftStart : draftEnd || draftStart;
    setTempStartDate(draftStart);
    setTempEndDate(draftEnd);
    setTempActiveDateField(activeField);
    setCalendarMonth(parseDateStringLocal(selectedDate));
    setShowDatePicker(true);
  }

  function closeDatePicker() {
    setShowDatePicker(false);
  }

  function shiftCalendarMonth(delta: number) {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function selectDateFromCalendar(date: Date) {
    const selected = toDateStringLocal(date);
    if (!isCalendarDateSelectable(date)) return;

    if (tempActiveDateField === 'end' && parseDateStringLocal(selected).getTime() < parseDateStringLocal(tempStartDate || todayDateString()).getTime()) {
      Alert.alert('Validation', 'End date cannot be before the start date.');
      return;
    }

    if (tempActiveDateField === 'start') {
      setTempStartDate(selected);
      if (tempEndDate && parseDateStringLocal(tempEndDate).getTime() < parseDateStringLocal(selected).getTime()) {
        setTempEndDate('');
      }
    } else {
      setTempEndDate(selected);
    }
  }

  function isCalendarDateSelectable(date: Date) {
    const selected = toDateStringLocal(date);
    const selectedTime = parseDateStringLocal(selected).getTime();
    const todayTime = parseDateStringLocal(todayDateString()).getTime();

    if (tempActiveDateField === 'start') {
      const originalStart = editing?.start_date ? toDateStringLocal(parseDateStringLocal(editing.start_date)) : '';
      const isExistingPastStart = !!editing && !!originalStart && selected === originalStart && selectedTime < todayTime;
      return selectedTime >= todayTime || isExistingPastStart;
    }

    return selectedTime >= parseDateStringLocal(tempStartDate || todayDateString()).getTime();
  }

  function commitScheduleSheet() {
    if (!tempStartDate) {
      Alert.alert('Validation', 'Please select a start date.');
      return;
    }

    const todayTime = parseDateStringLocal(todayDateString()).getTime();
    const tempStartTime = parseDateStringLocal(tempStartDate).getTime();
    const originalStart = editing?.start_date ? toDateStringLocal(parseDateStringLocal(editing.start_date)) : '';
    const startChanged = !editing || tempStartDate !== originalStart;

    if (startChanged && tempStartTime < todayTime) {
      Alert.alert('Validation', 'Start date cannot be in the past. Please select today or a future date.');
      return;
    }

    if (tempEndDate && parseDateStringLocal(tempEndDate).getTime() < tempStartTime) {
      Alert.alert('Validation', 'End date cannot be before the start date.');
      return;
    }

    setStartDate(tempStartDate);
    setEndDate(tempEndDate || '');
    closeDatePicker();
  }

  async function markTaken(medId: string, timeIso?: string) {
    const med = meds.find(m => m.id === medId);
    if (!med) return;
    const actionKey = `taken:${medId}`;
    if (busyActions[actionKey]) return;

    // Determine the scheduled time for this medication
    const scheduledTime = getScheduledTimeForMedication(med, timeIso);

    if (hasCompletedDose(medId, scheduledTime)) {
      notificationManager.showCustomNotification('Already taken', 'This scheduled dose is already marked taken.', 'toast', 'low');
      return;
    }
    setActionBusy(actionKey, true);
    const loggedAt = new Date().toISOString();
    const existingMissedDose = history.find((entry) => (
      entry.medId.toString() === medId.toString()
      && (entry.status === 'skipped' || entry.status === 'missed')
      && !isClearedHistory(entry)
      && isSameDoseTime(entry.time, scheduledTime)
    ));

    // Create new history entry
    const newHistoryEntry: HistoryEntry = {
      id: existingMissedDose?.id || uid(),
      medId,
      time: scheduledTime,
      status: 'completed',
      loggedAt,
    };

    // Update history immediately for better UX
    setHistory(prev => existingMissedDose
      ? prev.map((entry) => entry.id === existingMissedDose.id ? newHistoryEntry : entry)
      : [newHistoryEntry, ...prev]
    );
    const rollbackOptimisticTaken = () => {
      setHistory(prev => existingMissedDose
        ? prev.map((entry) => entry.id === existingMissedDose.id ? existingMissedDose : entry)
        : prev.filter(h => h.id !== newHistoryEntry.id)
      );
    };

    // Save to server if token exists
    if (token) {
      try {
        console.log('Marking medication as taken:', medId, 'at', scheduledTime);
        const response = await api.post(`/medications/${medId}/history`, { status: 'completed', time: scheduledTime }, token as string);
        console.log('Server response:', response);
        // Update with server ID if available
        if (response && response.id) {
          setHistory(prev => prev.map(h =>
            h.id === newHistoryEntry.id
              ? normalizeHistoryEntry({ ...response, logged_at: response.logged_at || response.taken_time || response.created_at || h.loggedAt }, medId)
              : h
          ));
        }

        // Also reload stats to update counters
        await reloadStatsAndUpcoming();
        notificationManager.showCustomNotification(
          isTakenLate(newHistoryEntry) ? 'Marked taken late' : 'Marked taken',
          `${med.name} was added to your history.`,
          'toast',
          'low'
        );
      } catch (err: any) {
        console.log('Error marking medication as taken:', err);
        console.log('Error details:', JSON.stringify(err, null, 2));
        rollbackOptimisticTaken();

        if (err?.status === 409) {
          notificationManager.showCustomNotification('Already taken', err?.data?.message || 'This scheduled dose has already been logged.', 'toast', 'low');
        } else if (err?.status === 404) {
          // Medication not found on server
          Alert.alert('Error', 'This medication no longer exists on the server. Please refresh the page.');
        } else if (err?.status === 401 || err?.status === 403) {
          // Authentication error
          Alert.alert('Authentication Error', 'Your session may have expired. Please log in again.');
        } else if (err?.status === 408) {
          // Timeout
          Alert.alert('Request Timeout', 'The request took too long. Please check your internet connection and try again.');
        } else if (err?.status >= 500) {
          // Server error
          Alert.alert('Server Error', 'The server encountered an error. Please try again later.');
        } else if (!err?.status && err?.message === 'Network request failed') {
          // Network error
          Alert.alert('Network Error', 'Unable to connect to the server. Please check your internet connection.');
        } else {
          // Generic error with details
          const errorMsg = err?.data?.message || err?.message || 'Unknown error occurred';
          Alert.alert('Error', `Failed to save: ${errorMsg}`);
        }
      } finally {
        setActionBusy(actionKey, false);
      }
    } else {
      setActionBusy(actionKey, false);
    }
  }

  async function snooze(medId: string, mins = 15) {
    const actionKey = `snooze:${medId}`;
    if (busyActions[actionKey]) return;
    const snoozedTime = new Date(Date.now() + mins * 60 * 1000).toISOString();
    const duplicateSnooze = history.find((entry) => {
      if (entry.medId.toString() !== medId.toString() || entry.status !== 'snoozed') return false;
      return Math.abs(new Date(entry.time).getTime() - new Date(snoozedTime).getTime()) < SNOOZE_DUPLICATE_WINDOW_MS;
    });

    if (duplicateSnooze) {
      notificationManager.showCustomNotification('Already Snoozed', `Reminder is already snoozed by ${mins} minutes`, 'toast', 'low');
      return;
    }

    setActionBusy(actionKey, true);
    const entry: HistoryEntry = { id: uid(), medId, time: snoozedTime, status: 'snoozed', loggedAt: new Date().toISOString() };

    // Update history immediately for better UX
    setHistory((h) => [entry, ...h]);

    // Schedule snooze reminder
    const med = meds.find(m => m.id === medId);
    if (med) {
      const snoozeTime = new Date(Date.now() + mins * 60 * 1000);
      notificationManager.scheduleMedicationReminder(snoozeTime, () => {
        showMedicationReminderPopup(med, snoozeTime);
      });
    }

    notificationManager.showCustomNotification(
      'Snoozed',
      `Reminder snoozed by ${mins} minutes`,
      'toast',
      'low'
    );

    if (token) {
      try {
        const response = await api.post(`/medications/${medId}/history`, { status: 'snoozed', time: entry.time }, token as string);
        if (response?.id) {
          setHistory((current) => current.map((item) => item.id === entry.id ? normalizeHistoryEntry({ ...response, logged_at: response.logged_at || response.created_at || item.loggedAt }, medId) : item));
        }
      } catch (err) {
        setHistory((current) => current.filter((item) => item.id !== entry.id));
        console.log('Snooze history sync failed:', err);
        showThemedPopup({
          title: 'Snooze failed',
          message: 'Could not sync this snooze. Please try again.',
          tone: 'error',
          icon: 'alert-circle',
        });
      } finally {
        setActionBusy(actionKey, false);
      }
    } else {
      setActionBusy(actionKey, false);
    }
  }


  async function clearHistory() {
    Alert.alert('Clear History', 'This will hide all visible history entries. Medical data will be preserved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        const now = Date.now();
        const visibleEntries = getValidHistoryEntries();
        const keysToClear = visibleEntries.flatMap((entry) => [entry.id, getHistoryCompositeKey(entry)]);
        const nextClearedKeys = Array.from(new Set([...clearedHistoryKeys, ...keysToClear]));
        const remainingHistory = history.filter((entry) => !keysToClear.includes(entry.id) && !keysToClear.includes(getHistoryCompositeKey(entry)));
        try {
          await AsyncStorage.setItem('medication_history_cleared_time', now.toString());
          await AsyncStorage.setItem(STORAGE_KEYS.CLEARED_HISTORY, JSON.stringify(nextClearedKeys));
          await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(remainingHistory));
          setLastClearedTime(now);
          setClearedHistoryKeys(nextClearedKeys);
          setHistory(remainingHistory);
          setHistoryExpanded(false);
        } catch (error) {
          console.log('Error saving cleared time:', error);
          Alert.alert('Error', 'Failed to clear history');
        }
      }},
    ]);
  }

  // Helper functions for new features
  function toggleDayOfWeek(day: number) {
    setDaysOfWeek(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  }

  function getDayName(day: number) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[day];
  }

  function getMedicationColor(med?: MedicationItem | any) {
    if (!med) return '#1E3A8A';
    const id = med.id?.toString();
    return med.color || meds.find((item) => item.id.toString() === id)?.color || '#1E3A8A';
  }

  function getHistoryCompositeKey(entry: HistoryEntry) {
    return `${entry.medId}:${entry.status}:${new Date(entry.time).toISOString()}`;
  }

  function isClearedHistory(entry: HistoryEntry) {
    return clearedHistoryKeys.includes(entry.id) || clearedHistoryKeys.includes(getHistoryCompositeKey(entry));
  }

  function isSameCalendarDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function isSameDoseTime(entryTime: string, scheduledTime: string) {
    const entry = new Date(entryTime);
    const scheduled = new Date(scheduledTime);
    return isSameCalendarDay(entry, scheduled)
      && entry.getHours() === scheduled.getHours()
      && entry.getMinutes() === scheduled.getMinutes();
  }

  function getHistoryLoggedAt(entry: HistoryEntry) {
    return entry.loggedAt || entry.time;
  }

  function isTakenLate(entry: HistoryEntry) {
    if (entry.status !== 'completed') return false;
    const scheduled = new Date(entry.time).getTime();
    const logged = new Date(getHistoryLoggedAt(entry)).getTime();
    if (!Number.isFinite(scheduled) || !Number.isFinite(logged)) return false;
    return logged - scheduled > LATE_GRACE_MS;
  }

  function getHistoryStatusDisplay(entry: HistoryEntry) {
    if (entry.status === 'completed') {
      return isTakenLate(entry)
        ? { label: 'Taken late', badgeStyle: styles.statusLate, textStyle: styles.statusLateText }
        : { label: 'Taken', badgeStyle: styles.statusCompleted, textStyle: styles.statusCompletedText };
    }
    if (entry.status === 'snoozed') {
      return { label: 'Snoozed', badgeStyle: styles.statusSnoozed, textStyle: styles.statusSnoozedText };
    }
    return { label: 'Missed', badgeStyle: styles.statusSkipped, textStyle: styles.statusSkippedText };
  }

  function getScheduledTimeForMedication(med: MedicationItem, timeIso?: string) {
    if (timeIso) return timeIso;

    const now = new Date(nowTick);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const scheduledTimes = (med.times || []).map((time) => {
      const source = new Date(time);
      const todayTime = new Date(today);
      todayTime.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), 0);
      return todayTime;
    });

    if (!scheduledTimes.length) return now.toISOString();

    const dueTimes = scheduledTimes.filter((time) => time.getTime() <= now.getTime());
    const selected = dueTimes.length
      ? dueTimes.sort((a, b) => b.getTime() - a.getTime())[0]
      : scheduledTimes.sort((a, b) => a.getTime() - b.getTime())[0];

    return selected.toISOString();
  }

  function hasCompletedDose(medId: string, scheduledTime: string) {
    return history.some((entry) => (
      entry.medId.toString() === medId.toString()
      && entry.status === 'completed'
      && !isClearedHistory(entry)
      && isSameDoseTime(entry.time, scheduledTime)
    ));
  }

  function setActionBusy(key: string, busy: boolean) {
    setBusyActions((current) => {
      const next = { ...current };
      if (busy) next[key] = true;
      else delete next[key];
      return next;
    });
  }

  function getValidHistoryEntries() {
    return history.filter((entry) => {
      const medExists = meds.some((med) => med.id.toString() === entry.medId.toString());
      const entryTime = new Date(entry.time).getTime();
      return medExists && entryTime > lastClearedTime && !isClearedHistory(entry);
    });
  }

  function getPlanHistoryLimit() {
    return Number.MAX_SAFE_INTEGER;
  }

  function isMedicationActive(med: MedicationItem) {
    if (med.end_date) {
      const end = new Date(med.end_date);
      end.setHours(23, 59, 59, 999);
      if (end.getTime() < nowTick) return false;
    }
    return med.reminder !== false;
  }

  function isMedicationScheduledToday(med: MedicationItem) {
    if (!med.times?.length) return false;
    const today = new Date(nowTick);
    if (med.start_date && new Date(med.start_date).getTime() > today.getTime()) return false;
    if (med.end_date) {
      const end = new Date(med.end_date);
      end.setHours(23, 59, 59, 999);
      if (end.getTime() < today.getTime()) return false;
    }
    if (med.frequency === 'weekly' && med.days_of_week?.length) {
      return med.days_of_week.includes(today.getDay());
    }
    return true;
  }

  function getStatsModalItems() {
    if (!statsModalType) return [];
    if (statsModalType === 'total') return meds;
    if (statsModalType === 'active') return meds.filter(isMedicationActive);
    if (statsModalType === 'today') return meds.filter(isMedicationScheduledToday);
    const missedIds = new Set(
      getValidHistoryEntries()
        .filter((entry) => (entry.status === 'skipped' || entry.status === 'missed') && isSameCalendarDay(new Date(entry.time), new Date(nowTick)))
        .map((entry) => entry.medId.toString())
    );
    return meds.filter((med) => missedIds.has(med.id.toString()));
  }

  function getStatsModalCopy() {
    switch (statsModalType) {
      case 'total':
        return { title: 'All Medications', subtitle: 'Every medication schedule saved in your list.' };
      case 'active':
        return { title: 'Active Medications', subtitle: 'Schedules with reminders enabled and no expired end date.' };
      case 'today':
        return { title: "Today's Schedule", subtitle: 'Medications scheduled for today, not only doses already taken.' };
      case 'missed':
        return { title: 'Missed Today', subtitle: 'Scheduled medication doses not marked taken after their time passed.' };
      default:
        return { title: '', subtitle: '' };
    }
  }

  function getNextLocalReminder(med: MedicationItem) {
    const now = new Date(nowTick);
    if (!isMedicationActive(med) || !med.times?.length) return null;

    const candidates: Date[] = [];
    for (let offset = 0; offset < 14; offset += 1) {
      const day = new Date(now);
      day.setDate(now.getDate() + offset);

      if (med.frequency === 'weekly' && med.days_of_week?.length && !med.days_of_week.includes(day.getDay())) {
        continue;
      }

      med.times.forEach((time) => {
        const source = new Date(time);
        const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), source.getHours(), source.getMinutes(), source.getSeconds(), 0);
        if (candidate.getTime() > now.getTime()) candidates.push(candidate);
      });
    }

    return candidates.sort((a, b) => a.getTime() - b.getTime())[0]?.toISOString() || null;
  }

  function getDisplayUpcoming() {
    const now = new Date(nowTick);
    const items: { medication: MedicationItem; next_reminder: string }[] = [];

    upcoming.forEach((item) => {
      const rawMed = item?.medication;
      if (!rawMed) return;
      const matchedMed = meds.find((m) => m.id.toString() === rawMed.id?.toString());
      const med = normalizeMedication(rawMed, matchedMed?.color);
      const nextReminder = item?.next_reminder;
      if (!nextReminder || new Date(nextReminder).getTime() <= now.getTime()) return;
      if (hasCompletedDose(med.id.toString(), nextReminder)) return;
      items.push({ medication: med, next_reminder: nextReminder });
    });

    meds.forEach((med) => {
      const nextReminder = getNextLocalReminder(med);
      if (nextReminder && !hasCompletedDose(med.id, nextReminder)) {
        items.push({ medication: med, next_reminder: nextReminder });
      }
    });

    const deduped = new Map<string, { medication: MedicationItem; next_reminder: string }>();
    items.forEach((item) => {
      const reminder = new Date(item.next_reminder);
      const key = `${item.medication.id}:${reminder.toISOString().slice(0, 16)}`;
      if (!deduped.has(key)) deduped.set(key, item);
    });

    return Array.from(deduped.values()).sort((a, b) => (
      new Date(a.next_reminder).getTime() - new Date(b.next_reminder).getTime()
    ));
  }

  async function handleExport() {
    if (!token) return;
    setExportModalVisible(true);
  }

  async function runExport(format: 'csv' | 'pdf') {
    if (!token || exporting) return;
    try {
      setExporting(true);
      await api.get(`/medications/export/${format}`, token as string, 20000);
      setExportModalVisible(false);
      Alert.alert(
        'Export Ready',
        `${format.toUpperCase()} export was generated successfully. This mobile build cannot save downloaded files directly yet, so please use the web download option if you need a local file.`
      );
    } catch (err: any) {
      console.log('Export error:', err);
      if (err?.status === 408) {
        Alert.alert('Export Timeout', 'The export took too long. Please check your connection and try again.');
      } else {
        const message = err?.data?.message || err?.message || `Failed to export ${format.toUpperCase()} medication history.`;
        Alert.alert('Export Failed', message);
      }
    } finally {
      setExporting(false);
    }
  }

  function formatTimeUntilNext(nextTime: string) {
    const now = new Date();
    const next = new Date(nextTime);
    const diffMs = next.getTime() - now.getTime();

    if (diffMs < 0) return 'Overdue';

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m`;
    } else {
      return `${diffMinutes}m`;
    }
  }

  if (loading) {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading medications...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayUpcoming = getDisplayUpcoming();
  const validHistory = getValidHistoryEntries();
  const planHistoryLimit = getPlanHistoryLimit();
  const historyLimit = historyExpanded ? planHistoryLimit : 5;
  const displayHistory = validHistory.slice(0, historyLimit);
  const statsModalCopy = getStatsModalCopy();
  const statsModalItems = getStatsModalItems();
  const calendarDays = buildCalendarDays(calendarMonth);
  const activeDateString = tempActiveDateField === 'start' ? tempStartDate : tempEndDate;
  const activeDateLabel = tempActiveDateField === 'start' ? formatDateDetail(tempStartDate) : (tempEndDate ? formatDateDetail(tempEndDate) : 'No end date');
  const selectedTime = tempTime || new Date();
  const selectedHour24 = selectedTime.getHours();
  const selectedHour12 = selectedHour24 === 0 ? 12 : (selectedHour24 > 12 ? selectedHour24 - 12 : selectedHour24);
  const selectedMinute = selectedTime.getMinutes();
  const selectedPeriod = selectedHour24 < 12 ? 'AM' : 'PM';

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
        scrollEventThrottle={16}
        onScroll={(event) => {
          const nextElevated = event.nativeEvent.contentOffset.y > 8;
          if (nextElevated !== headerElevated) setHeaderElevated(nextElevated);
        }}
      >
        {/* Header */}
        <View style={[styles.headerSection, headerElevated && styles.headerSectionElevated, { paddingTop: Math.max(insets.top, 8) }]}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.headerTitle}>Medication</Text>
              <Text style={styles.headerSubtitle}>Track schedules and reminders</Text>
            </View>
            <TouchableOpacity
              style={styles.exportButton}
              onPress={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#1E3A8A" />
              ) : (
                <Ionicons name="download-outline" size={16} color="#1E3A8A" />
              )}
              <Text style={styles.exportButtonText}>{exporting ? 'Exporting' : 'Export'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Dashboard */}
        <View style={styles.statsContainer}>
          <TouchableOpacity style={styles.statCard} onPress={() => setStatsModalType('total')} activeOpacity={0.85}>
            <View style={styles.statIcon}>
              <Ionicons name="medkit" size={16} color="#2563EB" />
            </View>
            <Text style={styles.statNumber}>{stats?.total_medications ?? 0}</Text>
            <Text style={styles.statLabel}>Total meds</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => setStatsModalType('active')} activeOpacity={0.85}>
            <View style={styles.statIcon}>
              <Ionicons name="checkmark-circle" size={16} color="#2563EB" />
            </View>
            <Text style={styles.statNumber}>{stats?.active_medications ?? 0}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => setStatsModalType('today')} activeOpacity={0.85}>
            <View style={styles.statIcon}>
              <Ionicons name="calendar" size={16} color="#2563EB" />
            </View>
            <Text style={styles.statNumber}>{stats?.completed_today ?? 0}</Text>
            <Text style={styles.statLabel}>Taken today</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.statCard, styles.statCardMissed]} onPress={() => setStatsModalType('missed')} activeOpacity={0.85}>
            <View style={[styles.statIcon, styles.statIconMissed]}>
              <Ionicons name="alert-circle" size={16} color="#C2410C" />
            </View>
            <Text style={styles.statNumber}>{stats?.missed_today ?? 0}</Text>
            <Text style={styles.statLabel}>Missed</Text>
          </TouchableOpacity>
        </View>

        {/* Upcoming Medications */}
        {displayUpcoming.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            {displayUpcoming.slice(0, 3).map((item) => (
              <View key={`${item.medication.id}-${item.next_reminder}`} style={styles.upcomingCard}>
                <View style={[styles.upcomingIcon, { backgroundColor: getMedicationColor(item.medication) }]}>
                  <Ionicons name="medkit-outline" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.upcomingContent}>
                  <Text style={styles.upcomingName}>{item.medication.name}</Text>
                  <Text style={styles.upcomingTime}>
                    {new Date(item.next_reminder).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={styles.upcomingRight}>
                  <Text style={styles.upcomingCountdown}>
                    {formatTimeUntilNext(item.next_reminder)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Medications List */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Your Medications</Text>
          {meds.length === 0 ? (
          <View style={styles.emptyState}>
              <Ionicons name="medkit" size={48} color="#9CA3AF" />
              <Text style={styles.emptyText}>No medications yet</Text>
              <Text style={styles.emptySubtext}>Tap the + button to add your first medication</Text>
          </View>
          ) : (
            meds.map((med) => {
              const scheduledTime = getScheduledTimeForMedication(med);
              const doseCompleted = hasCompletedDose(med.id, scheduledTime);
              const taking = !!busyActions[`taken:${med.id}`];
              const snoozing = !!busyActions[`snooze:${med.id}`];
              const deleting = !!busyActions[`delete:${med.id}`];
              return (
              <View key={med.id} style={[styles.medicationCard, { borderLeftColor: getMedicationColor(med) }]}>
                <View style={styles.medicationMainRow}>
                  <View style={[styles.medicationIcon, { backgroundColor: '#EEF2FF', borderColor: getMedicationColor(med) }]}>
                    <Ionicons name="medkit-outline" size={20} color={getMedicationColor(med)} />
                  </View>

                  <View style={styles.medicationContent}>
                    <Text style={styles.medicationName}>{med.name}</Text>
                    <Text style={styles.medicationDosage}>{med.dosage}</Text>

                    <View style={styles.medicationTimes}>
                      {med.times.map((time, index) => (
                        <View key={index} style={styles.timeBadge}>
                           <Ionicons name="time-outline" size={11} color="#2563EB" />
                           <Text style={styles.timeText}>
                             {new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                           </Text>
                        </View>
                      ))}
                    </View>

                    {med.notes && (
                      <Text style={styles.medicationNotes}>{med.notes}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.medicationActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, doseCompleted ? styles.takenButtonComplete : styles.takenButton, taking && styles.actionButtonDisabled]}
                    onPress={() => markTaken(med.id)}
                    disabled={taking}
                    activeOpacity={0.75}
                    accessibilityLabel={doseCompleted ? 'Dose already taken' : 'Mark medication taken'}
                  >
                    {taking ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name={doseCompleted ? 'checkmark-done-circle' : 'checkmark-done'} size={18} color={doseCompleted ? '#16A34A' : '#FFFFFF'} />}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.snoozeButton, snoozing && styles.actionButtonDisabled]}
                    onPress={() => snooze(med.id)}
                    disabled={snoozing}
                    activeOpacity={0.75}
                    accessibilityLabel="Snooze medication reminder"
                  >
                    {snoozing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="alarm" size={15} color="#FFFFFF" />}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.editButton]}
                    onPress={() => openEdit(med)}
                    activeOpacity={0.75}
                    accessibilityLabel="Edit medication"
                  >
                    <Ionicons name="create-outline" size={15} color="#1E3A8A" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton, deleting && styles.actionButtonDisabled]}
                    onPress={() => deleteMedication(med.id)}
                    disabled={deleting}
                    activeOpacity={0.75}
                    accessibilityLabel="Delete medication"
                  >
                    {deleting ? <ActivityIndicator size="small" color="#DC2626" /> : <Ionicons name="trash-outline" size={15} color="#DC2626" />}
                  </TouchableOpacity>
                </View>
              </View>
              );
            })
          )}
        </View>

        {/* Recent History */}
        <View style={styles.historySection}>
          <View style={styles.historyHeader}>
            <View>
              <Text style={styles.sectionTitle}>Recent History</Text>
              <Text style={styles.historySubtitle}>
                Showing {Math.min(displayHistory.length, historyLimit)} of {Math.min(validHistory.length, planHistoryLimit)} entries
              </Text>
            </View>
            {validHistory.length > 0 && (
              <TouchableOpacity onPress={clearHistory} style={styles.clearButton}>
                <Ionicons name="trash-outline" size={14} color="#DC2626" />
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {displayHistory.length === 0 ? (
            <View style={styles.emptyHistoryState}>
              <Ionicons name="time-outline" size={42} color="#94A3B8" />
              <Text style={styles.emptyHistoryText}>No recent history</Text>
              <Text style={styles.emptyHistorySubtext}>
                Your medication activity will appear here
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.historyList}>
                {displayHistory.map((h) => {
                  const med = meds.find(m => m.id === h.medId);
                  const statusDisplay = getHistoryStatusDisplay(h);
                  const historyTime = new Date(h.time).toLocaleDateString() + ' at ' + new Date(h.time).toLocaleTimeString([], { hour: 'numeric', hour12: true });
                  const loggedTime = new Date(getHistoryLoggedAt(h)).toLocaleTimeString([], { hour: 'numeric', hour12: true });
                  return (
                    <View key={h.id} style={[styles.historyItem, { borderLeftColor: getMedicationColor(med) }]}>
                      <View style={styles.historyLeft}>
                        <Text style={styles.historyMed}>
                          {med?.name || 'Unknown Medication'}
                        </Text>
                        <Text style={styles.historyTime}>
                          {statusDisplay.label === 'Taken late' ? `${historyTime} - logged ${loggedTime}` : historyTime}
                        </Text>
                      </View>
                      <View style={styles.historyRight}>
                        <View style={[styles.statusBadge, statusDisplay.badgeStyle]}>
                          <Text style={[styles.statusText, statusDisplay.textStyle]}>{statusDisplay.label}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>

              {validHistory.length > 5 && (
                <TouchableOpacity style={styles.viewMoreButton} onPress={() => setHistoryExpanded((current) => !current)}>
                  <Text style={styles.viewMoreText}>{historyExpanded ? 'Show less' : 'View more'}</Text>
                  <Ionicons name={historyExpanded ? 'chevron-up' : 'chevron-down'} size={15} color="#1E3A8A" />
                </TouchableOpacity>
              )}

            </>
          )}
        </View>
      </Animated.ScrollView>

      <BottomNavigation currentRoute="medication" />

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={openAdd}
        accessibilityLabel="Add medication"
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={24} color="white" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" onRequestClose={()=>setModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={()=>setModalVisible(false)} style={styles.modalClose}>
              <Ionicons name="close" size={20} color="#374151" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editing ? 'Edit Medication' : 'Add Medication'}</Text>
            <View style={{ width: 40 }} />
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={styles.formCard}>
              <Text style={styles.formSectionTitle}>Medicine Details</Text>
              <Text style={styles.label}>Name</Text>
              <View>
                <TextInput
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    if (selectedOtcMedicine && text.trim() !== selectedOtcMedicine.name) setSelectedOtcMedicine(null);
                  }}
                  style={styles.input}
                  placeholder="e.g., Vitamin C, Biogesic, Neozep"
                  onFocus={() => name.length >= 2 && setShowMedicineSuggestions(true)}
                />

                {/* Medicine Suggestions in Modal */}
                {showMedicineSuggestions && medicineSuggestions.length > 0 && (
                  <View style={styles.modalSuggestionsContainer}>
                    <ScrollView style={styles.modalSuggestionsList} nestedScrollEnabled>
                      {medicineSuggestions.map((medicine: OtcMedicineSuggestion) => (
                        <TouchableOpacity
                          key={String(medicine.id || medicine.name)}
                          style={styles.modalSuggestionItem}
                          onPress={() => {
                            setName(medicine.name);
                            setSelectedOtcMedicine(medicine);
                            setDosage(medicine.dosage_text || medicine.dosage || dosage);
                            setShowMedicineSuggestions(false);

                            const smartTimes = buildTimesForMedicine(medicine);
                            if (smartTimes.length > 0) setTimes(smartTimes);
                          }}
                        >
                          <View style={styles.modalSuggestionIcon}>
                            <Ionicons name="medkit" size={19} color="#FFFFFF" />
                          </View>
                          <View style={styles.modalSuggestionContent}>
                            <Text style={styles.modalSuggestionName}>{medicine.name}</Text>
                            <Text style={styles.modalSuggestionDetails}>
                              {[medicine.generic_name || medicine.brand, medicine.category].filter(Boolean).join(' - ')}
                            </Text>
                            {(medicine.dosage_text || medicine.dosage) && (
                              <Text style={styles.modalSuggestionDosage}>Label guidance: {medicine.dosage_text || medicine.dosage}</Text>
                            )}
                            <Text style={styles.modalSuggestionSafety}>{medicine.warnings || OTC_SAFETY_COPY}</Text>
                          </View>
                          <Ionicons name="add-circle" size={20} color="#1E3A8A" />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {selectedOtcMedicine && (
                <View style={styles.selectedMedicineCard}>
                  <View style={styles.selectedMedicineIcon}>
                    <Ionicons name="medkit-outline" size={16} color="#1E3A8A" />
                  </View>
                  <View style={styles.selectedMedicineCopy}>
                    <Text style={styles.selectedMedicineTitle}>{selectedOtcMedicine.name}</Text>
                    <Text style={styles.selectedMedicineMeta}>
                      {[selectedOtcMedicine.generic_name || selectedOtcMedicine.brand, selectedOtcMedicine.category].filter(Boolean).join(' - ') || 'OTC medicine selected'}
                    </Text>
                  </View>
                </View>
              )}

              <Text style={styles.label}>Dosage</Text>
              <TextInput value={dosage} onChangeText={setDosage} style={styles.input} placeholder="e.g., 500 mg" />
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formSectionTitle}>Reminder Times</Text>
              <Text style={styles.label}>Times</Text>
              <View style={styles.addTimeButtonRow}>
                <TouchableOpacity
                  style={styles.addTimeButton}
                  onPress={()=>{
                    setPickerIndex(null);
                    setTempTime(new Date());
                    setTimeModalVisible(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#1E3A8A" />
                  <Text style={styles.addTimeText}>Add time</Text>
                </TouchableOpacity>
              </View>

              {times.length === 0 ? (
                <Text style={styles.emptyTimeHelper}>No reminder times yet. Add at least one time to receive reminders.</Text>
              ) : (
                <View style={styles.timeChipGrid}>
                  {times.map((t, idx) => (
                    <View key={idx} style={styles.timeRowModal}>
                      <Text style={styles.timeTextModal}>{new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}</Text>
                      <View style={styles.timeChipActions}>
                        <TouchableOpacity onPress={() => {
                          setPickerIndex(idx);
                          setTempTime(new Date(t));
                          setTimeModalVisible(true);
                        }} style={styles.smallBtn}>
                          <Ionicons name="create" size={16} color="#1E3A8A" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeTime(idx)} style={styles.smallBtn}>
                          <Ionicons name="trash" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formSectionTitle}>Reminder Schedule</Text>
              <View style={styles.rowBetween}>
                <Text style={styles.label}>Reminder</Text>
                <TouchableOpacity onPress={() => setReminder(r => !r)} style={[styles.toggle, reminder && styles.toggleOn]}>
                  <View style={[styles.toggleKnob, reminder && { transform: [{ translateX: 16 }] }]} />
                </TouchableOpacity>
              </View>

              {/* Advanced Scheduling */}
              <Text style={styles.label}>Schedule</Text>
              <Text style={styles.scheduleHelperText}>Choose when reminders start and optionally end.</Text>

              <TouchableOpacity style={styles.scheduleCard} onPress={() => openScheduleSheet('start')} activeOpacity={0.85}>
              <View style={styles.scheduleRow}>
                 <TouchableOpacity
                   style={styles.dateButton}
                   onPress={() => openScheduleSheet('start')}
                   activeOpacity={0.7}
                 >
                   <View style={styles.dateButtonIcon}>
                     <Ionicons name="calendar" size={15} color="#1E3A8A" />
                   </View>
                   <View style={styles.dateButtonCopy}>
                     <Text style={styles.dateButtonLabel}>Start</Text>
                     <Text style={styles.dateButtonText}>{formatDateLabel(startDate)}</Text>
                   </View>
                   <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                 </TouchableOpacity>

                 <TouchableOpacity
                   style={styles.dateButton}
                   onPress={() => openScheduleSheet('end')}
                   activeOpacity={0.7}
                 >
                   <View style={styles.dateButtonIcon}>
                     <Ionicons name="calendar-clear" size={15} color="#1E3A8A" />
                   </View>
                   <View style={styles.dateButtonCopy}>
                     <Text style={styles.dateButtonLabel}>End</Text>
                     <Text style={styles.dateButtonText}>{endDate ? formatDateLabel(endDate) : 'No end date'}</Text>
                   </View>
                   <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                 </TouchableOpacity>
              </View>
              </TouchableOpacity>

              <Text style={styles.label}>Frequency</Text>
              <View style={styles.frequencyContainer}>
                {['daily', 'weekly', 'monthly', 'custom'].map((freq) => (
                  <TouchableOpacity
                    key={freq}
                    style={[
                      styles.frequencyButton,
                      frequency === freq && styles.frequencyButtonActive
                    ]}
                    onPress={() => setFrequency(freq as any)}
                  >
                    <Text style={[
                      styles.frequencyButtonText,
                      frequency === freq && styles.frequencyButtonTextActive
                    ]}>
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {frequency === 'weekly' && (
                <View style={styles.daysContainer}>
                  <Text style={styles.label}>Days of Week</Text>
                  <View style={styles.daysRow}>
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                      <TouchableOpacity
                        key={day}
                        style={[
                          styles.dayButton,
                          daysOfWeek.includes(day) && styles.dayButtonActive
                        ]}
                        onPress={() => toggleDayOfWeek(day)}
                      >
                        <Text style={[
                          styles.dayButtonText,
                          daysOfWeek.includes(day) && styles.dayButtonTextActive
                        ]}>
                          {getDayName(day)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formSectionTitle}>Additional Details</Text>
              <Text style={styles.label}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                style={[styles.input, styles.notesInput]}
                placeholder="Add notes about this medication..."
                multiline
                numberOfLines={3}
              />

              <Text style={styles.label}>Color</Text>
              <View style={styles.colorContainer}>
                {['#1E3A8A', '#DC2626', '#059669', '#D97706', '#7C3AED', '#DB2777'].map((colorOption) => (
                  <TouchableOpacity
                    key={colorOption}
                    style={[
                      styles.colorButton,
                      { backgroundColor: colorOption },
                      color === colorOption && styles.colorButtonActive
                    ]}
                    onPress={() => {
                      console.log('Color button pressed:', colorOption);
                      setColor(colorOption);
                    }}
                    activeOpacity={0.7}
                  >
                    {color === colorOption && (
                      <View style={styles.colorCheck}>
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity onPress={saveMedication} style={styles.saveBtn}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </ScrollView>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>

           {/* Time picker modal */}
           <Modal visible={timeModalVisible} transparent animationType="fade" onRequestClose={() => { setTimeModalVisible(false); setPickerIndex(null); }}>
            <View style={styles.timeModalWrapper}>
               <TouchableWithoutFeedback onPress={() => { setTimeModalVisible(false); setPickerIndex(null); }}>
                <View style={styles.timeModalBackdrop} />
              </TouchableWithoutFeedback>
              <Animated.View style={[styles.timeModalContent, { marginBottom: Math.max(insets.bottom, 12), opacity: MODAL_ANIM, transform: [{ translateY: MODAL_ANIM.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
                <Text style={styles.timeModalTitle}>Select time</Text>
                <View style={styles.timePreviewPill}>
                  <Text style={styles.timePreviewLabel}>Selected time</Text>
                  <Text style={styles.timeModalPreview}>{formatReminderTime(selectedTime)}</Text>
                </View>
                 <View style={styles.timePickerContainer}>
                   {/* Hour Picker (1-12) */}
                   <View style={styles.timePickerColumn}>
                     <Text style={styles.timePickerLabel}>Hour</Text>
                     <ScrollView
                       style={styles.timePickerScroll}
                       contentContainerStyle={styles.timePickerScrollContent}
                       contentOffset={{ x: 0, y: Math.max((selectedHour12 - 3) * 42, 0) }}
                       showsVerticalScrollIndicator={false}
                     >
                       {Array.from({ length: 12 }, (_, i) => {
                         const hour = i + 1; // 1-12
                         return (
                           <TouchableOpacity
                             key={hour}
                             style={[styles.timePickerOption, selectedHour12 === hour && styles.timePickerOptionSelected]}
                             onPress={() => {
                               const isAM = selectedHour24 < 12;
                               let newHour24;
                               if (hour === 12) {
                                 newHour24 = isAM ? 0 : 12; // 12 AM = 0, 12 PM = 12
                               } else {
                                 newHour24 = isAM ? hour : hour + 12; // AM = same, PM = +12
                               }
                               setTempTimeParts({ hour24: newHour24 });
                             }}
                           >
                             <Text style={[styles.timePickerOptionText, selectedHour12 === hour && styles.timePickerOptionTextSelected]}>
                               {hour}
                             </Text>
                           </TouchableOpacity>
                         );
                       })}
                        </ScrollView>
                      </View>

                   {/* Minute Picker */}
                   <View style={styles.timePickerColumn}>
                     <Text style={styles.timePickerLabel}>Minute</Text>
                     <ScrollView
                       style={styles.timePickerScroll}
                       contentContainerStyle={styles.timePickerScrollContent}
                       contentOffset={{ x: 0, y: Math.max((selectedMinute - 2) * 42, 0) }}
                       showsVerticalScrollIndicator={false}
                     >
                       {Array.from({ length: 60 }, (_, minute) => (
                         <TouchableOpacity
                           key={minute}
                           style={[styles.timePickerOption, selectedMinute === minute && styles.timePickerOptionSelected]}
                           onPress={() => setTempTimeParts({ minute })}
                         >
                           <Text style={[styles.timePickerOptionText, selectedMinute === minute && styles.timePickerOptionTextSelected]}>
                             {`${minute}`.padStart(2, '0')}
                           </Text>
                         </TouchableOpacity>
                       ))}
                     </ScrollView>
                   </View>

                   {/* AM/PM Picker */}
                   <View style={styles.timePickerColumn}>
                     <Text style={styles.timePickerLabel}>AM/PM</Text>
                     <ScrollView
                       style={styles.timePickerScroll}
                       contentContainerStyle={styles.timePickerScrollContent}
                       contentOffset={{ x: 0, y: selectedPeriod === 'PM' ? 18 : 0 }}
                       showsVerticalScrollIndicator={false}
                     >
                       {['AM', 'PM'].map((period) => {
                         const isSelected = selectedPeriod === period;
                         return (
                           <TouchableOpacity
                             key={period}
                             style={[styles.timePickerOption, isSelected && styles.timePickerOptionSelected]}
                             onPress={() => {
                               let newHour24;
                               if (selectedHour12 === 12) {
                                 newHour24 = period === 'AM' ? 0 : 12; // 12 AM = 0, 12 PM = 12
                               } else {
                                 newHour24 = period === 'AM' ? selectedHour12 : selectedHour12 + 12; // AM = same, PM = +12
                               }
                               setTempTimeParts({ hour24: newHour24 });
                             }}
                           >
                             <Text style={[styles.timePickerOptionText, isSelected && styles.timePickerOptionTextSelected]}>
                               {period}
                             </Text>
                           </TouchableOpacity>
                         );
                       })}
                        </ScrollView>
                      </View>
                            </View>
                 <View style={styles.timeModalActions}>
                   <TouchableOpacity style={styles.timeCancelButton} onPress={() => { setTimeModalVisible(false); setPickerIndex(null); }}>
                        <Text style={styles.timeCancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.timeAddButton} onPress={() => {
                     if (addOrUpdateReminderTime(selectedTime)) setTimeModalVisible(false);
                      }}>
                        <Text style={styles.timeAddButtonText}>Add</Text>
                      </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
          </Modal>

          {/* DateTimePicker removed from inside Modal to avoid Android dialog/Modal conflict. */}
        </SafeAreaView>
      </Modal>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={closeDatePicker}>
        <View style={styles.dateModalWrapper}>
          <TouchableWithoutFeedback onPress={closeDatePicker}>
            <View style={styles.dateModalBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.dateModalContent}>
            <View style={styles.dateModalHeader}>
              <View>
                <Text style={styles.dateModalTitle}>Schedule</Text>
                <Text style={styles.dateModalSubtitle}>Choose when this medication schedule starts and optionally ends.</Text>
              </View>
              <TouchableOpacity style={styles.dateModalClose} onPress={closeDatePicker} activeOpacity={0.8}>
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <View style={styles.scheduleRangeCard}>
              <TouchableOpacity
                style={[styles.scheduleRangeRow, tempActiveDateField === 'start' && styles.scheduleRangeRowActive]}
                onPress={() => {
                  setTempActiveDateField('start');
                  setCalendarMonth(parseDateStringLocal(tempStartDate || todayDateString()));
                }}
                activeOpacity={0.85}
              >
                <View style={[styles.scheduleRangeIcon, tempActiveDateField === 'start' && styles.scheduleRangeIconActive]}>
                  <Ionicons name="play" size={12} color={tempActiveDateField === 'start' ? '#FFFFFF' : '#1E3A8A'} />
                </View>
                <View style={styles.scheduleRangeCopy}>
                  <Text style={styles.scheduleRangeLabel}>Starts</Text>
                  <Text style={styles.scheduleRangeValue}>{formatDateDetail(tempStartDate)}</Text>
                </View>
                {tempActiveDateField === 'start' && <Text style={styles.scheduleRangeEditing}>Editing</Text>}
              </TouchableOpacity>

              <View style={styles.scheduleRangeDivider} />

              <TouchableOpacity
                style={[styles.scheduleRangeRow, tempActiveDateField === 'end' && styles.scheduleRangeRowActive]}
                onPress={() => {
                  setTempActiveDateField('end');
                  setCalendarMonth(parseDateStringLocal(tempEndDate || tempStartDate || todayDateString()));
                }}
                activeOpacity={0.85}
              >
                <View style={[styles.scheduleRangeIcon, tempActiveDateField === 'end' && styles.scheduleRangeIconActive]}>
                  <Ionicons name="stop" size={12} color={tempActiveDateField === 'end' ? '#FFFFFF' : '#1E3A8A'} />
                </View>
                <View style={styles.scheduleRangeCopy}>
                  <Text style={styles.scheduleRangeLabel}>Ends</Text>
                  <Text style={styles.scheduleRangeValue}>{tempEndDate ? formatDateDetail(tempEndDate) : 'No end date'}</Text>
                </View>
                {tempActiveDateField === 'end' && <Text style={styles.scheduleRangeEditing}>Editing</Text>}
              </TouchableOpacity>
            </View>
            <Text style={styles.scheduleSheetActiveText}>{tempActiveDateField === 'start' ? 'Pick a start date' : 'Pick an optional end date'}: {activeDateLabel}</Text>
            <View style={styles.dateQuickActions}>
              <TouchableOpacity
                style={styles.dateQuickButton}
                onPress={() => {
                  selectDateFromCalendar(parseDateStringLocal(todayDateString()));
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="today-outline" size={14} color="#1E3A8A" />
                <Text style={styles.dateQuickText}>Use today</Text>
              </TouchableOpacity>
              {tempActiveDateField === 'end' && (
                <TouchableOpacity
                  style={[styles.dateQuickButton, styles.dateQuickClearButton]}
                  onPress={() => {
                    setTempEndDate('');
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="remove-circle-outline" size={14} color="#64748B" />
                  <Text style={[styles.dateQuickText, styles.dateQuickClearText]}>No end date</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.calendarPanel}>
              <View style={styles.calendarMonthHeader}>
                <TouchableOpacity style={styles.calendarNavButton} onPress={() => shiftCalendarMonth(-1)} activeOpacity={0.8}>
                  <Ionicons name="chevron-back" size={18} color="#1E3A8A" />
                </TouchableOpacity>
                <Text style={styles.calendarMonthTitle}>{formatCalendarTitle(calendarMonth)}</Text>
                <TouchableOpacity style={styles.calendarNavButton} onPress={() => shiftCalendarMonth(1)} activeOpacity={0.8}>
                  <Ionicons name="chevron-forward" size={18} color="#1E3A8A" />
                </TouchableOpacity>
              </View>
              <View style={styles.calendarWeekRow}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                  <Text key={`${day}-${index}`} style={styles.calendarWeekText}>{day}</Text>
                ))}
              </View>
              <View style={styles.calendarGrid}>
                {calendarDays.map((date) => {
                  const dateString = toDateStringLocal(date);
                  const isSelected = activeDateString === dateString;
                  const isToday = todayDateString() === dateString;
                  const isCurrentMonth = date.getMonth() === calendarMonth.getMonth();
                  const isDisabled = !isCalendarDateSelectable(date);
                  return (
                    <TouchableOpacity
                      key={dateString}
                      style={[
                        styles.calendarDay,
                        isDisabled && styles.calendarDayDisabled,
                        isSelected && !isDisabled && styles.calendarDaySelected,
                        isToday && !isSelected && !isDisabled && styles.calendarDayToday,
                      ]}
                      onPress={() => selectDateFromCalendar(date)}
                      disabled={isDisabled}
                      activeOpacity={0.8}
                    >
                      <Text style={[
                        styles.calendarDayText,
                        !isCurrentMonth && styles.calendarDayMutedText,
                        isDisabled && styles.calendarDayDisabledText,
                        isToday && !isSelected && !isDisabled && styles.calendarDayTodayText,
                        isSelected && !isDisabled && styles.calendarDaySelectedText,
                      ]}>
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={styles.dateModalButtons}>
              <TouchableOpacity
                style={styles.dateModalCancelButton}
                onPress={closeDatePicker}
              >
                <Text style={styles.dateModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateModalDoneButton}
                onPress={commitScheduleSheet}
              >
                <Text style={styles.dateModalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Medication Modal */}
      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deleteTarget || !busyActions[`delete:${deleteTarget.id}`]) setDeleteTarget(null);
        }}
      >
        <View style={styles.confirmModalWrapper}>
          <TouchableWithoutFeedback onPress={() => {
            if (!deleteTarget || !busyActions[`delete:${deleteTarget.id}`]) setDeleteTarget(null);
          }}>
            <View style={styles.sheetBackdrop} />
          </TouchableWithoutFeedback>
          <View style={[styles.confirmModalContent, styles.popupModalContent]}>
            <View style={styles.deleteIconWrap}>
              <Ionicons name="warning" size={24} color="#DC2626" />
            </View>
            <Text style={styles.confirmModalTitle}>Delete Medication?</Text>
            <Text style={styles.confirmModalMessage}>This will remove this medication from your schedule.</Text>
            {!!deleteTarget?.name && <Text style={styles.deleteMedicationName}>{deleteTarget.name}</Text>}
            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteCancelButton}
                onPress={() => setDeleteTarget(null)}
                disabled={!!deleteTarget && !!busyActions[`delete:${deleteTarget.id}`]}
                activeOpacity={0.8}
              >
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirmButton, !!deleteTarget && busyActions[`delete:${deleteTarget.id}`] && styles.deleteConfirmButtonDisabled]}
                onPress={confirmDeleteMedication}
                disabled={!!deleteTarget && !!busyActions[`delete:${deleteTarget.id}`]}
                activeOpacity={0.8}
              >
                {!!deleteTarget && busyActions[`delete:${deleteTarget.id}`] ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.deleteConfirmText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Themed Popup Modal */}
      <Modal
        visible={!!themedPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setThemedPopup(null)}
      >
        <View style={styles.confirmModalWrapper}>
          <TouchableWithoutFeedback onPress={() => setThemedPopup(null)}>
            <View style={styles.sheetBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.confirmModalContent}>
            <View style={[
              styles.popupIconWrap,
              themedPopup?.tone === 'error' ? styles.popupIconError :
              themedPopup?.tone === 'warning' ? styles.popupIconWarning :
              styles.popupIconInfo
            ]}>
              <Ionicons
                name={themedPopup?.icon || 'information-circle'}
                size={24}
                color={
                  themedPopup?.tone === 'error' ? '#DC2626' :
                  themedPopup?.tone === 'warning' ? '#C2410C' :
                  '#2563EB'
                }
              />
            </View>
            <Text style={styles.confirmModalTitle}>{themedPopup?.title}</Text>
            <Text style={styles.confirmModalMessage}>{themedPopup?.message}</Text>
            <TouchableOpacity
              style={styles.popupPrimaryButton}
              onPress={() => setThemedPopup(null)}
              activeOpacity={0.85}
            >
              <Text style={styles.popupPrimaryText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Export Modal */}
      <Modal visible={exportModalVisible} transparent animationType="fade" onRequestClose={() => setExportModalVisible(false)}>
        <View style={styles.sheetWrapper}>
          <TouchableWithoutFeedback onPress={() => !exporting && setExportModalVisible(false)}>
            <View style={styles.sheetBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.sheetContent}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Export Medication History</Text>
            <Text style={styles.sheetSubtitle}>Choose a format for your medication history export.</Text>
            {(['csv', 'pdf'] as const).map((format) => (
              <TouchableOpacity
                key={format}
                style={[styles.exportOption, exporting && styles.exportOptionDisabled]}
                onPress={() => runExport(format)}
                disabled={exporting}
                activeOpacity={0.85}
              >
                <View style={styles.exportOptionIcon}>
                  <Ionicons name={format === 'csv' ? 'document-text' : 'document'} size={18} color="#2563EB" />
                </View>
                <View style={styles.exportOptionTextWrap}>
                  <Text style={styles.exportOptionTitle}>{format.toUpperCase()}</Text>
                  <Text style={styles.exportOptionSubtitle}>{format === 'csv' ? 'Spreadsheet-friendly history' : 'Printable medication report'}</Text>
                </View>
                {exporting ? <ActivityIndicator size="small" color="#2563EB" /> : <Ionicons name="chevron-forward" size={18} color="#64748B" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.sheetCancelButton} onPress={() => setExportModalVisible(false)} disabled={exporting}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Stats Detail Modal */}
      <Modal visible={!!statsModalType} transparent animationType="fade" onRequestClose={() => setStatsModalType(null)}>
        <View style={styles.sheetWrapper}>
          <TouchableWithoutFeedback onPress={() => setStatsModalType(null)}>
            <View style={styles.sheetBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.sheetContent}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{statsModalCopy.title}</Text>
            <Text style={styles.sheetSubtitle}>{statsModalCopy.subtitle}</Text>
            <ScrollView style={styles.statsDetailList} showsVerticalScrollIndicator={false}>
              {statsModalItems.length === 0 ? (
                <View style={styles.statsEmptyState}>
                  <Ionicons name="information-circle" size={28} color="#94A3B8" />
                  <Text style={styles.statsEmptyText}>{statsModalType === 'missed' ? 'No missed medications recorded.' : 'No matching medications'}</Text>
                </View>
              ) : (
                statsModalItems.map((med) => (
                  <View key={med.id} style={styles.statsDetailItem}>
                      <View style={[styles.statsDetailIcon, { backgroundColor: getMedicationColor(med) }]}>
                      <Ionicons name="medkit-outline" size={15} color="#FFFFFF" />
                    </View>
                    <View style={styles.statsDetailContent}>
                      <Text style={styles.statsDetailName}>{med.name}</Text>
                      <Text style={styles.statsDetailMeta}>{med.dosage || 'No dosage'} - {(med.times || []).length} reminder time{(med.times || []).length === 1 ? '' : 's'}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.sheetCancelButton} onPress={() => setStatsModalType(null)}>
              <Text style={styles.sheetCancelText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 15, color: '#64748B', fontWeight: '700' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 104 },

  // Header
  headerSection: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10, backgroundColor: '#F8FAFC', zIndex: 10, borderBottomWidth: 1, borderBottomColor: 'transparent' },
  headerSectionElevated: {
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E2E8F0',
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  headerSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 17, fontWeight: '700' },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    minHeight: 38,
    paddingVertical: 7,
    borderRadius: 999,
    gap: 5,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  exportButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E3A8A',
  },

  // Stats Dashboard
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    justifyContent: 'space-between'
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2
  },
  statCardMissed: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statIconMissed: { backgroundColor: '#FFEDD5' },
  statNumber: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  statLabel: { fontSize: 10, color: '#64748B', marginTop: 2, fontWeight: '800' },

  // Sections
  sectionContainer: { paddingHorizontal: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A', marginBottom: 10 },

  // Upcoming Medications
  upcomingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2
  },
  upcomingIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  upcomingInitial: { color: 'white', fontWeight: '700', fontSize: 18 },
  upcomingContent: { flex: 1 },
  upcomingName: { fontSize: 15, fontWeight: '900', color: '#0F172A' },
  upcomingTime: { fontSize: 12, color: '#64748B', marginTop: 3, fontWeight: '700' },
  upcomingRight: { alignItems: 'flex-end' },
  upcomingCountdown: { fontSize: 12, fontWeight: '900', color: '#1E3A8A', backgroundColor: '#EFF6FF', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, overflow: 'hidden' },

  // Medication Cards
  medicationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 13,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2
  },
  medicationMainRow: { flexDirection: 'row', alignItems: 'flex-start' },
  medicationIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    borderWidth: 1
  },
  medicationInitial: { color: 'white', fontWeight: '700', fontSize: 20 },
  medicationContent: { flex: 1 },
  medicationName: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  medicationDosage: { fontSize: 12, color: '#64748B', marginTop: 3, fontWeight: '700' },
  medicationTimes: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 },
  medicationNotes: { fontSize: 12, color: '#64748B', marginTop: 5, lineHeight: 16, fontWeight: '600' },

  // Time Badges
  timeBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  timeText: { color: '#1E3A8A', fontWeight: '800', fontSize: 11 },

  // Action Buttons
  medicationActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EFF6FF',
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  actionButtonDisabled: { opacity: 0.55 },
  takenButton: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  takenButtonComplete: { backgroundColor: '#ECFDF5', borderColor: '#86EFAC' },
  snoozeButton: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  editButton: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  deleteButton: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2
  },
  emptyText: { fontSize: 15, color: '#0F172A', marginTop: 12, fontWeight: '900' },
  emptySubtext: { fontSize: 12, color: '#64748B', marginTop: 4, fontWeight: '600', textAlign: 'center' },

  // Empty History State
  emptyHistoryState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2
  },
  emptyHistoryText: {
    fontSize: 15,
    color: '#0F172A',
    marginTop: 12,
    fontWeight: '900'
  },
  emptyHistorySubtext: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600'
  },

  // History
  historySection: {
    paddingHorizontal: 20,
    marginBottom: 18,
    marginTop: 2
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  historySubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '700'
  },
  historyList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2
  },
  clearButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  clearText: { color: '#DC2626', fontWeight: '800', fontSize: 12 },
  historyItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 4,
  },
  historyLeft: { flex: 1 },
  historyMed: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  historyTime: { fontSize: 12, color: '#64748B', marginTop: 3, fontWeight: '600' },
  historyRight: { alignItems: 'flex-end' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  statusCompleted: { backgroundColor: '#ECFDF5', borderColor: '#BBF7D0' },
  statusCompletedText: { color: '#047857' },
  statusLate: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
  statusLateText: { color: '#C2410C' },
  statusSnoozed: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  statusSnoozedText: { color: '#B45309' },
  statusSkipped: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  statusSkippedText: { color: '#DC2626' },
  statusText: { fontSize: 11, fontWeight: '800', color: '#374151' },
  upgradeHistoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginTop: 12,
    gap: 8
  },
  upgradeHistoryText: {
    color: '#1E3A8A',
    fontWeight: '800',
    fontSize: 12
  },
  viewMoreButton: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingVertical: 10,
  },
  viewMoreText: { color: '#1E3A8A', fontSize: 12, fontWeight: '900' },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 92,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    elevation: 10,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12
  },

  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
    backgroundColor: '#FFFFFF'
  },
  modalClose: { padding: 8, backgroundColor: '#EFF6FF', borderRadius: 999 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  modalBody: { padding: 16, paddingBottom: 48 },

  // Bottom Sheets
  sheetWrapper: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.42)' },
  sheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  sheetHandle: { width: 42, height: 4, borderRadius: 4, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  sheetSubtitle: { fontSize: 12, color: '#64748B', fontWeight: '700', lineHeight: 17, marginTop: 4, marginBottom: 14 },
  sheetCancelButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', paddingVertical: 12, marginTop: 12 },
  sheetCancelText: { color: '#1E3A8A', fontWeight: '900', fontSize: 13 },
  confirmModalWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  confirmModalContent: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  deleteIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  confirmModalTitle: { fontSize: 19, fontWeight: '900', color: '#0F172A', marginBottom: 6 },
  confirmModalMessage: { fontSize: 13, lineHeight: 19, color: '#64748B', textAlign: 'center', fontWeight: '600' },
  deleteMedicationName: { marginTop: 10, fontSize: 14, color: '#0F172A', fontWeight: '900', textAlign: 'center' },
  deleteModalActions: { flexDirection: 'row', gap: 10, marginTop: 18, width: '100%' },
  deleteCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  deleteCancelText: { color: '#334155', fontWeight: '900' },
  deleteConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    shadowColor: '#DC2626',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  deleteConfirmButtonDisabled: { opacity: 0.65 },
  deleteConfirmText: { color: '#FFFFFF', fontWeight: '900' },
  popupModalContent: { borderColor: '#DBEAFE' },
  popupIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  popupIconInfo: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  popupIconWarning: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
  popupIconError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  popupPrimaryButton: {
    width: '100%',
    marginTop: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  popupPrimaryText: { color: '#FFFFFF', fontWeight: '900' },
  exportOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#DBEAFE', borderRadius: 14, padding: 12, marginBottom: 10 },
  exportOptionDisabled: { opacity: 0.65 },
  exportOptionIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  exportOptionTextWrap: { flex: 1 },
  exportOptionTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  exportOptionSubtitle: { fontSize: 11, fontWeight: '700', color: '#64748B', marginTop: 2 },
  statsDetailList: { maxHeight: 280 },
  statsDetailItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  statsDetailIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  statsDetailContent: { flex: 1 },
  statsDetailName: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  statsDetailMeta: { fontSize: 11, color: '#64748B', fontWeight: '700', marginTop: 2 },
  statsEmptyState: { alignItems: 'center', paddingVertical: 24 },
  statsEmptyText: { marginTop: 8, color: '#64748B', fontSize: 12, fontWeight: '800' },

  // Form Elements
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    padding: 14,
    marginBottom: 14,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  formSectionTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A', marginBottom: 2 },
  label: { fontSize: 12, fontWeight: '900', color: '#475569', marginBottom: 7, marginTop: 14, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600'
  },
  notesInput: { height: 78, textAlignVertical: 'top' },
  selectedMedicineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    padding: 10,
    marginTop: 2,
    marginBottom: 2,
  },
  selectedMedicineIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  selectedMedicineCopy: { flex: 1, minWidth: 0 },
  selectedMedicineTitle: { fontSize: 13, fontWeight: '900', color: '#0F172A' },
  selectedMedicineMeta: { fontSize: 11, fontWeight: '700', color: '#64748B', marginTop: 2 },

  // Time Management
  timesHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addTimeButtonRow: { alignItems: 'center', marginTop: 2, marginBottom: 12 },
  addTimeButton: {
    minWidth: 178,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  addTimeText: { color: '#1E3A8A', fontWeight: '900', fontSize: 14 },
  emptyTimeHelper: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    paddingHorizontal: 12,
    paddingVertical: 11,
    textAlign: 'center',
  },
  timeChipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeRowModal: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginRight: 8,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 120,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1
  },
  timeTextModal: { fontWeight: '900', color: '#0F172A', fontSize: 14 },
  timeChipActions: { flexDirection: 'row', marginLeft: 4 },
  smallBtn: { marginLeft: 6, padding: 7, borderRadius: 8, backgroundColor: '#EFF6FF' },

  // Toggle
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 10, backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1, borderColor: '#DBEAFE', paddingHorizontal: 12, paddingVertical: 10 },
  toggle: { width: 50, height: 30, borderRadius: 15, backgroundColor: '#E5E7EB', justifyContent: 'center', padding: 3 },
  toggleOn: { backgroundColor: '#2563EB' },
  toggleKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'white', transform: [{ translateX: 0 }] },

  // Advanced Scheduling
  scheduleCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 0,
    marginBottom: 12,
  },
  scheduleHelperText: { color: '#64748B', fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: -2, marginBottom: 10 },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  dateButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#D7E6FF'
  },
  dateButtonIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginRight: 8,
  },
  dateButtonCopy: { flex: 1, minWidth: 0 },
  dateButtonLabel: { fontSize: 10, color: '#64748B', fontWeight: '900', textTransform: 'uppercase', marginBottom: 1 },
  dateButtonText: { fontSize: 13, color: '#0F172A', fontWeight: '900', flexShrink: 1 },

  frequencyContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, gap: 8 },
  frequencyButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  frequencyButtonActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  frequencyButtonText: { fontSize: 13, fontWeight: '800', color: '#1E3A8A' },
  frequencyButtonTextActive: { color: 'white' },

  daysContainer: { marginBottom: 12 },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  dayButtonActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  dayButtonText: { fontSize: 12, fontWeight: '800', color: '#1E3A8A' },
  dayButtonTextActive: { color: 'white' },

  // Color Picker
  colorContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent'
  },
  colorButtonActive: {
    borderColor: '#0F172A',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 5
  },
  colorCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
  },

  // Save Button
  saveBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 18,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4
  },
  saveText: { color: 'white', fontWeight: '900', fontSize: 15 },

  // Medicine Suggestions in Modal
  modalSuggestionsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: -8,
    marginBottom: 8,
    maxHeight: 250,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  modalSuggestionsList: {
    maxHeight: 250,
  },
  modalSuggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalSuggestionIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#93C5FD',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  modalSuggestionContent: {
    flex: 1,
  },
  modalSuggestionName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
  },
  modalSuggestionDetails: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 2,
  },
  modalSuggestionDosage: {
    fontSize: 11,
    color: '#1E3A8A',
    fontWeight: '800',
  },
  modalSuggestionSafety: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    lineHeight: 14,
    marginTop: 4,
  },

  // Time Picker Modal
  timeModalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.42)' },
  timeModalContent: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14
  },
  timeModalTitle: { fontSize: 19, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  timePreviewLabel: { fontSize: 10, fontWeight: '900', color: '#64748B', textTransform: 'uppercase', marginBottom: 3, letterSpacing: 0 },
  timePreviewPill: {
    minWidth: 126,
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginBottom: 16,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  timeModalPreview: { fontSize: 25, fontWeight: '900', color: '#1E3A8A' },
  timeModalWrapper: { flex: 1, justifyContent: 'flex-end', alignItems: 'stretch' },

  // Wheel Picker
  pickerLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#475569',
    textAlign: 'center',
    marginBottom: 8
  },
  wheelWrap: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8 },
  wheelColumn: { width: 80, height: 44 * 3, overflow: 'hidden' },
  wheelColumnSeparator: { width: 20, alignItems: 'center', justifyContent: 'center' },
  wheelItem: { height: 44, alignItems: 'center', justifyContent: 'center' },
  wheelItemSelected: { backgroundColor: 'transparent' },
  wheelItemText: { fontSize: 22, color: '#374151' },
  wheelItemTextSelected: { color: '#1E3A8A', fontWeight: '700' },
  previewText: { textAlign: 'center', color: '#6B7280', marginTop: 12, fontSize: 14 },

  // Date Picker Modal
  dateModalWrapper: { flex: 1, justifyContent: 'flex-end', alignItems: 'stretch' },
  dateModalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.42)' },
  dateModalContent: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 24,
    padding: 15,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
    maxHeight: '90%',
  },
  dateModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dateModalEyebrow: { fontSize: 11, color: '#64748B', fontWeight: '900', textTransform: 'uppercase', marginBottom: 2 },
  dateModalTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', letterSpacing: 0 },
  dateModalSubtitle: { fontSize: 11, color: '#64748B', fontWeight: '700', lineHeight: 16, marginTop: 4, maxWidth: 282 },
  dateModalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateQuickActions: { flexDirection: 'row', width: '100%', gap: 8, marginBottom: 12 },
  dateQuickButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#EAF3FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    paddingVertical: 8,
  },
  dateQuickText: { color: '#1E3A8A', fontWeight: '900', fontSize: 12 },
  dateQuickClearButton: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
  dateQuickClearText: { color: '#64748B' },
  scheduleRangeCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D7E6FF',
    padding: 5,
    marginBottom: 8,
  },
  scheduleRangeRow: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduleRangeRowActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  scheduleRangeDivider: { height: 1, backgroundColor: '#E2E8F0', marginHorizontal: 12, marginVertical: 2 },
  scheduleRangeIcon: {
    width: 30,
    height: 30,
    borderRadius: 11,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  scheduleRangeIconActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  scheduleRangeCopy: { flex: 1, minWidth: 0 },
  scheduleRangeLabel: { fontSize: 11, color: '#64748B', fontWeight: '900', textTransform: 'uppercase', marginBottom: 2 },
  scheduleRangeValue: { fontSize: 15, color: '#0F172A', fontWeight: '900' },
  scheduleRangeEditing: {
    color: '#1E3A8A',
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: '900',
  },
  scheduleSheetActiveText: { fontSize: 12, color: '#334155', fontWeight: '900', marginBottom: 8 },

  calendarPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    padding: 10,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  calendarMonthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calendarNavButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  calendarWeekRow: { flexDirection: 'row', marginBottom: 5 },
  calendarWeekText: { flex: 1, textAlign: 'center', fontSize: 11, color: '#64748B', fontWeight: '900' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDay: {
    width: '14.2857%',
    height: 33,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    marginVertical: 1,
  },
  calendarDaySelected: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOpacity: 0.22,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  calendarDayToday: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  calendarDayDisabled: { opacity: 0.42 },
  calendarDayText: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  calendarDayMutedText: { color: '#CBD5E1' },
  calendarDayDisabledText: { color: '#CBD5E1' },
  calendarDayTodayText: { color: '#1E3A8A' },
  calendarDaySelectedText: { color: '#FFFFFF' },
  // Legacy wheel styles kept for the time picker.
  datePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    height: 210,
    gap: 6
  },
  pickerColumn: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE'
  },
  pickerScroll: {
    flex: 1,
    maxHeight: 160
  },
  pickerOption: {
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
    marginVertical: 2,
    alignItems: 'center'
  },
  pickerOptionSelected: {
    backgroundColor: '#2563EB'
  },
  pickerOptionText: {
    fontSize: 16,
    color: '#334155',
    fontWeight: '800'
  },
  pickerOptionTextSelected: {
    color: 'white',
    fontWeight: '700'
  },

  // Time Picker
  timePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
    height: 244,
    gap: 8
  },
  timePickerColumn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 7,
    paddingTop: 10,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  timePickerLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#475569',
    textAlign: 'center',
    marginBottom: 8
  },
  timePickerScroll: {
    flex: 1,
    maxHeight: 190
  },
  timePickerScrollContent: {
    paddingVertical: 3,
  },
  timePickerOption: {
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 13,
    marginVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timePickerOptionSelected: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOpacity: 0.2,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  timePickerOptionText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '800'
  },
  timePickerOptionTextSelected: {
    color: 'white',
    fontWeight: '900'
  },
  timeModalActions: { flexDirection: 'row', alignItems: 'center', marginTop: 2, width: '100%', gap: 10 },
  timeCancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeCancelButtonText: { color: '#334155', fontWeight: '900', fontSize: 13 },
  timeAddButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  timeAddButtonText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 13,
  },
  dateInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 16,
    textAlign: 'center'
  },
  timeInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 16,
    textAlign: 'center'
  },
  dateModalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, width: '100%', gap: 10 },
  dateModalCancelButton: { flex: 1, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 15, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', alignItems: 'center' },
  dateModalCancelText: { color: '#1E3A8A', fontWeight: '900' },
  dateModalDoneButton: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 15,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  dateModalDoneText: { color: 'white', fontWeight: '900' },

  // Buttons
  secondaryBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  secondaryBtnText: { color: '#1E3A8A', fontWeight: '900' },
  primarySmallBtn: { backgroundColor: '#2563EB', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primarySmallBtnText: { color: 'white', fontWeight: '900' },
});
