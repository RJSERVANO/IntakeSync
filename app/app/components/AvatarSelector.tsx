import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ThemedNoticeModal, { ThemedNoticeType } from './common/ThemedNoticeModal';

export const PRESET_AVATARS = [
  { id: 'avatar1', source: require('../../assets/images/avatar1.png') },
  { id: 'avatar2', source: require('../../assets/images/avatar2.png') },
  { id: 'avatar3', source: require('../../assets/images/avatar3.png') },
  { id: 'avatar4', source: require('../../assets/images/avatar4.png') },
  { id: 'avatar5', source: require('../../assets/images/avatar5.png') },
  { id: 'avatar6', source: require('../../assets/images/avatar6.png') },
];

export const AVATAR_STORAGE_KEY = 'selected_avatar_v1';

export type SelectedAvatar =
  | { type: 'preset'; id: string }
  | { type: 'custom'; uri: string };

export function getAvatarSource(selected: SelectedAvatar | null) {
  if (selected?.type === 'custom' && selected.uri) {
    return { uri: selected.uri };
  }

  if (selected?.type === 'preset') {
    const match = PRESET_AVATARS.find((avatar) => avatar.id === selected.id);
    if (match) return match.source;
  }

  return null;
}

type AvatarSelectorProps = {
  onChange?: (selected: SelectedAvatar) => void;
};

export default function AvatarSelector({ onChange }: AvatarSelectorProps) {
  const [selected, setSelected] = useState<SelectedAvatar | null>(null);
  const [loading, setLoading] = useState(true);
  const [noticeModal, setNoticeModal] = useState<{
    type: ThemedNoticeType;
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(AVATAR_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SelectedAvatar;
          setSelected(parsed);
          onChange?.(parsed);
        } else {
          setSelected({ type: 'preset', id: PRESET_AVATARS[0].id });
        }
      } catch (err) {
        console.warn('AvatarSelector: failed to load saved avatar', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [onChange]);

  const persistSelection = async (next: SelectedAvatar) => {
    setSelected(next);
    onChange?.(next);
    try {
      await AsyncStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn('AvatarSelector: failed to save avatar', err);
    }
  };

  const handleSelectPreset = (id: string) => {
    persistSelection({ type: 'preset', id });
  };

  const handleUploadCustom = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setNoticeModal({
          type: 'warning',
          title: 'Permission Needed',
          message: 'Please allow photo access to upload a custom avatar.',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (result.canceled) return;

      const uri = result.assets?.[0]?.uri;
      if (!uri) return;

      persistSelection({ type: 'custom', uri });
    } catch (err) {
      console.warn('AvatarSelector: upload error', err);
      setNoticeModal({
        type: 'error',
        title: 'Upload Failed',
        message: 'Could not select an image. Please try again.',
      });
    }
  };

  const renderAvatar = ({ item }: { item: (typeof PRESET_AVATARS)[number] }) => {
    const isSelected = selected?.type === 'preset' && selected.id === item.id;
    return (
      <TouchableOpacity onPress={() => handleSelectPreset(item.id)} style={styles.avatarWrapper}>
        <Image source={item.source} style={[styles.avatar, isSelected && styles.avatarSelected]} />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Choose an avatar</Text>
        <Text style={styles.subtle}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Choose an avatar</Text>
      <FlatList
        data={PRESET_AVATARS}
        horizontal
        keyExtractor={(item) => item.id}
        renderItem={renderAvatar}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={(
          <TouchableOpacity onPress={handleUploadCustom} style={styles.uploadAvatar}>
            <Ionicons name="person-add-outline" size={24} color="#2563EB" />
          </TouchableOpacity>
        )}
      />
      <ThemedNoticeModal
        visible={Boolean(noticeModal)}
        type={noticeModal?.type || 'info'}
        title={noticeModal?.title || ''}
        message={noticeModal?.message || ''}
        onPrimary={() => setNoticeModal(null)}
        onClose={() => setNoticeModal(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  heading: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtle: {
    fontSize: 14,
    color: '#6B7280',
  },
  listContent: {
    paddingVertical: 4,
    paddingRight: 4,
  },
  avatarWrapper: {
    marginRight: 10,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarSelected: {
    borderColor: '#2563EB',
  },
  uploadAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#BFDBFE',
  },
});
