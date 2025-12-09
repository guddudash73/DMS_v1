import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { LoginResponse } from '@dms/types';

export type Role = LoginResponse['role'];

export interface StoredAuthPayload {
  userId: string;
  role: Role;
  accessToken: string;
  expiresAt: number;
}

export interface AuthState {
  userId?: string;
  role?: Role;
  accessToken?: string;
  expiresAt?: number;
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
    restoreFromStorage(state, action: PayloadAction<StoredAuthPayload | null>) {
      const payload = action.payload;
      if (!payload || payload.expiresAt <= Date.now()) {
        state.userId = undefined;
        state.role = undefined;
        state.accessToken = undefined;
        state.expiresAt = undefined;
        state.status = 'unauthenticated';
        state.error = undefined;
        return;
      }
      state.userId = payload.userId;
      state.role = payload.role;
      state.accessToken = payload.accessToken;
      state.expiresAt = payload.expiresAt;
      state.status = 'authenticated';
      state.error = undefined;
    },
    setCredentials(state, action: PayloadAction<LoginResponse>) {
      const { userId, role, tokens } = action.payload;
      state.userId = userId;
      state.role = role;
      state.accessToken = tokens.accessToken;
      state.expiresAt = Date.now() + tokens.expiresInSec * 1000;
      state.status = 'authenticated';
      state.error = undefined;
    },
    setUnauthenticated(state) {
      state.userId = undefined;
      state.role = undefined;
      state.accessToken = undefined;
      state.expiresAt = undefined;
      state.status = 'unauthenticated';
      state.error = undefined;
    },
    setAuthError(state, action: PayloadAction<string | undefined>) {
      state.error = action.payload;
      if (state.status === 'checking') {
        state.status = 'unauthenticated';
      }
    },
  },
});

export const { restoreFromStorage, setCredentials, setUnauthenticated, setAuthError } =
  authSlice.actions;

export const authReducer = authSlice.reducer;
