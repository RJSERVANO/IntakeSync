import { useState, useEffect } from 'react';
import api from '../app/api';
import { getCachedSession, mergeLocalAvatarIntoUser, updateCachedUser } from '../services/offlineStorage';

interface NormalizedUser {
  [key: string]: any;
}

export default function useUser(token?: string) {
  const [user, setUser] = useState<NormalizedUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      if (!token) {
        const cached = await getCachedSession();
        const cachedUser = await mergeLocalAvatarIntoUser(cached?.user ?? null);
        setUser(cachedUser);
        return;
      }
      const cached = await getCachedSession();
      if (cached?.user) {
        const cachedUser = await mergeLocalAvatarIntoUser(cached.user);
        setUser(cachedUser);
        setLoading(false);
      }
      const data: any = await api.get('/me', token as string);
      // Return the raw data but also add normalized/camelCase aliases
      const merged: any = {
        ...(data || {}),
        phone: data.phone || data.mobile || undefined,
        dateOfBirth: data.date_of_birth || data.dateOfBirth || undefined,
        emergencyContact: data.emergency_contact || data.emergencyContact || undefined,
      };
      const withLocalAvatar = await mergeLocalAvatarIntoUser(merged);
      setUser(withLocalAvatar);
      await updateCachedUser(withLocalAvatar, token);
    } catch (err) {
      console.warn('useUser: failed to load user', err);
      if (api.isAuthError(err)) {
        setUser(null);
        return;
      }
      const cached = await getCachedSession();
      const cachedUser = await mergeLocalAvatarIntoUser(cached?.user ?? null);
      setUser(cachedUser);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return { user, setUser, loading, reload: load };
}
