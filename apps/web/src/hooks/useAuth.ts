'use client';

import { useSelector } from 'react-redux';
import type { RootState } from '@/src/store';

export function useAuth() {
  return useSelector((state: RootState) => state.auth);
}

export function useRequireAuth() {
  return useAuth();
}
