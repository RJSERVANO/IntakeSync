import { useEffect, useState, useCallback } from 'react';
import api from '../app/api';
import { captureAuthSessionContext, isAuthSessionContextCurrent } from '../services/authSession';

export type Insight = {
  id: number;
  type: string; // hydration | medication | sleep | weather | general
  payload: any;
  title: string;
  description?: string;
  generated_at: string;
};

export function useInsights(initialType?: string, token?: string) {
  const [data, setData] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string | undefined>(initialType);

  const fetchInsights = useCallback(async (t?: string) => {
    if (!token) {
      setError('Authentication required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const context = await captureAuthSessionContext(token);
      if (!(await isAuthSessionContextCurrent(context))) return;
      const q = t ?? type;
      const url = q ? `/insights?type=${encodeURIComponent(q)}` : '/insights';
      const res = await api.get(url, token, 5000);
      if (!(await isAuthSessionContextCurrent(context))) return;
      setData(res?.data ?? res ?? []);
    } catch (e: any) {
      if (api.isStaleSessionError(e)) return;
      setError(e?.message ?? 'Failed to fetch insights');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [type, token]);

  const createInsight = useCallback(async (insight: Omit<Insight, 'id'>) => {
    if (!token) {
      const err = new Error('Authentication required');
      setError('Authentication required');
      throw err;
    }
    setLoading(true);
    setError(null);
    try {
      const context = await captureAuthSessionContext(token);
      if (!(await isAuthSessionContextCurrent(context))) throw new Error('Stale session request ignored.');
      const res = await api.post('/insights', insight, token);
      if (!(await isAuthSessionContextCurrent(context))) throw new Error('Stale session request ignored.');
      return res?.data ?? res as Insight;
    } catch (e: any) {
      if (api.isStaleSessionError(e)) throw e;
      setError(e?.message ?? 'Failed to create insight');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // initial fetch
    if (token) {
      fetchInsights().catch(() => {});
    }
  }, [type, token, fetchInsights]);

  return { data, loading, error, type, setType, fetchInsights, createInsight };
}
