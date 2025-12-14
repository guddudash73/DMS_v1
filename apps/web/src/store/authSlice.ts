import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { LoginResponse } from '@dms/types';

export type Role = LoginResponse['role'];

export interface StoredAuthPayload {
  userId: string;
  role: Role;
  accessToken?: string;
  accessExpiresAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
}

export interface AuthState {
  userId?: string;
  role?: Role;

  accessToken?: string;
  accessExpiresAt?: number;

  refreshToken?: string;
  refreshExpiresAt?: number;

  status: 'checking' | 'authenticated' | 'unauthenticated';
  error?: string;
}

const initialState: AuthState = {
  status: 'checking',
};

type RefreshLikeResponse = {
  userId?: string;
  role?: Role;
  tokens?: {
    accessToken?: string;
    refreshToken?: string;
    expiresInSec?: number;
    refreshExpiresInSec?: number;
  };
  accessToken?: string;
  refreshToken?: string;
  expiresInSec?: number;
  refreshExpiresInSec?: number;
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    restoreFromStorage(state, action: PayloadAction<StoredAuthPayload | null>) {
      const payload = action.payload;
      const now = Date.now();

      if (!payload) {
        state.userId = undefined;
        state.role = undefined;
        state.accessToken = undefined;
        state.accessExpiresAt = undefined;
        state.refreshToken = undefined;
        state.refreshExpiresAt = undefined;
        state.status = 'unauthenticated';
        state.error = undefined;
        return;
      }

      const refreshValid =
        payload.refreshToken &&
        typeof payload.refreshExpiresAt === 'number' &&
        payload.refreshExpiresAt > now;

      if (!refreshValid) {
        state.userId = undefined;
        state.role = undefined;
        state.accessToken = undefined;
        state.accessExpiresAt = undefined;
        state.refreshToken = undefined;
        state.refreshExpiresAt = undefined;
        state.status = 'unauthenticated';
        state.error = undefined;
        return;
      }

      state.userId = payload.userId;
      state.role = payload.role;

      state.refreshToken = payload.refreshToken;
      state.refreshExpiresAt = payload.refreshExpiresAt;

      const accessValid =
        payload.accessToken &&
        typeof payload.accessExpiresAt === 'number' &&
        payload.accessExpiresAt > now;

      state.accessToken = accessValid ? payload.accessToken : undefined;
      state.accessExpiresAt = accessValid ? payload.accessExpiresAt : payload.accessExpiresAt;

      state.status = 'authenticated';
      state.error = undefined;
    },

    setCredentials(state, action: PayloadAction<LoginResponse>) {
      const { userId, role, tokens } = action.payload;
      const now = Date.now();

      state.userId = userId;
      state.role = role;

      state.accessToken = tokens.accessToken;
      state.accessExpiresAt = now + tokens.expiresInSec * 1000;

      state.refreshToken = tokens.refreshToken;
      state.refreshExpiresAt = now + tokens.refreshExpiresInSec * 1000;

      state.status = 'authenticated';
      state.error = undefined;
    },

    setTokensFromRefresh(state, action: PayloadAction<RefreshLikeResponse>) {
      const now = Date.now();
      const r = action.payload;

      const tokens = r.tokens ?? {};

      const accessToken = tokens.accessToken ?? r.accessToken;
      const refreshToken = tokens.refreshToken ?? r.refreshToken;

      const expiresInSec = tokens.expiresInSec ?? r.expiresInSec;
      const refreshExpiresInSec = tokens.refreshExpiresInSec ?? r.refreshExpiresInSec;

      if (r.userId) state.userId = r.userId;
      if (r.role) state.role = r.role;

      if (accessToken && typeof expiresInSec === 'number') {
        state.accessToken = accessToken;
        state.accessExpiresAt = now + expiresInSec * 1000;
      }

      if (refreshToken && typeof refreshExpiresInSec === 'number') {
        state.refreshToken = refreshToken;
        state.refreshExpiresAt = now + refreshExpiresInSec * 1000;
      }

      state.status = 'authenticated';
      state.error = undefined;
    },

    setUnauthenticated(state) {
      state.userId = undefined;
      state.role = undefined;
      state.accessToken = undefined;
      state.accessExpiresAt = undefined;
      state.refreshToken = undefined;
      state.refreshExpiresAt = undefined;
      state.status = 'unauthenticated';
      state.error = undefined;
    },

    setAuthError(state, action: PayloadAction<string | undefined>) {
      state.error = action.payload;
      if (state.status === 'checking') state.status = 'unauthenticated';
    },
  },
});

export const {
  restoreFromStorage,
  setCredentials,
  setTokensFromRefresh,
  setUnauthenticated,
  setAuthError,
} = authSlice.actions;

export const authReducer = authSlice.reducer;
