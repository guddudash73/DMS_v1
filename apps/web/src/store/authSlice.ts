// apps/web/src/store/authSlice.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { LoginResponse, RefreshResponse } from '@dms/types';

export type Role = LoginResponse['role'];

export interface AuthState {
  userId?: string;
  role?: Role;
  accessToken?: string;
  accessExpiresAt?: number;
  status: 'checking' | 'authenticated' | 'unauthenticated';
  error?: string;
}

const initialState: AuthState = {
  status: 'checking',
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<LoginResponse>) {
      const { userId, role, tokens } = action.payload;
      const now = Date.now();

      state.userId = userId;
      state.role = role;

      state.accessToken = tokens.accessToken;
      state.accessExpiresAt = now + tokens.expiresInSec * 1000;

      state.status = 'authenticated';
      state.error = undefined;
    },

    setTokensFromRefresh(state, action: PayloadAction<RefreshResponse>) {
      const now = Date.now();
      const r = action.payload;

      state.userId = r.userId;
      state.role = r.role;

      state.accessToken = r.tokens.accessToken;
      state.accessExpiresAt = now + r.tokens.expiresInSec * 1000;

      state.status = 'authenticated';
      state.error = undefined;
    },

    setUnauthenticated(state) {
      state.userId = undefined;
      state.role = undefined;
      state.accessToken = undefined;
      state.accessExpiresAt = undefined;
      state.status = 'unauthenticated';
      state.error = undefined;
    },

    setAuthError(state, action: PayloadAction<string | undefined>) {
      state.error = action.payload;
      if (state.status === 'checking') state.status = 'unauthenticated';
    },

    setChecking(state) {
      state.status = 'checking';
      state.error = undefined;
    },
  },
});

export const {
  setCredentials,
  setTokensFromRefresh,
  setUnauthenticated,
  setAuthError,
  setChecking,
} = authSlice.actions;

export const authReducer = authSlice.reducer;
