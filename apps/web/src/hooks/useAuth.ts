// apps/web/src/hooks/useAuth.ts
'use client';

import { useSelector } from 'react-redux';
import type { RootState } from '@/src/store';

export function useAuth() {
  return useSelector((state: RootState) => state.auth);
}

// Backwards-compatible alias for your layouts
export function useRequireAuth() {
  return useAuth();
}
