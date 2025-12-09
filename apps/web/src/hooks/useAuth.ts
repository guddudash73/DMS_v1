'use client';

import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../store/types';
import { restoreFromStorage, setUnauthenticated, type StoredAuthPayload } from '../store/authSlice';

const STORAGE_KEY = 'dms_auth';

export function useAuth() {
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);
  const hasHydrated = useRef(false);

  // 1. Hydrate from localStorage once
  useEffect(() => {
    if (hasHydrated.current) return;
    hasHydrated.current = true;

    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        dispatch(setUnauthenticated());
        return;
      }
      const parsed = JSON.parse(raw) as StoredAuthPayload | null;
      dispatch(restoreFromStorage(parsed));
    } catch {
      dispatch(setUnauthenticated());
    }
  }, [dispatch]);

  // 2. Persist to localStorage when auth changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (
      auth.status === 'authenticated' &&
      auth.userId &&
      auth.role &&
      auth.accessToken &&
      auth.expiresAt
    ) {
      const payload: StoredAuthPayload = {
        userId: auth.userId,
        role: auth.role,
        accessToken: auth.accessToken,
        expiresAt: auth.expiresAt,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } else if (auth.status === 'unauthenticated') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [auth]);

  return auth;
}

// For now this is just a convenience hook; middleware does the redirecting
export function useRequireAuth() {
  return useAuth();
}
