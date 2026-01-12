import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import type { FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';

import type {
  LoginRequest as LoginRequestBody,
  LoginResponse,
  RefreshResponse,
  Patient,
  PatientCreate,
  PatientSearchQuery,
  DailyReport,
  DailyPatientSummary,
  DailyPatientSummarySeries,
  AdminDoctorListItem,
  Visit,
  VisitCreate,
  VisitCreateResponse,
  Xray,
  XrayContentType,
  MedicineTypeaheadItem,
  QuickAddMedicineInput,
  RxLineType,
  Prescription,
  Billing,
  BillingCheckoutInput,
  PrescriptionPreset,
  PrescriptionPresetSearchQuery,
  AdminMedicineListResponse,
  AdminMedicineSearchQuery,
  AdminUpdateMedicineRequest,
  AdminRxPresetListResponse,
  AdminRxPresetSearchQuery,
  MedicinePreset,
  MedicineForm,
  AdminUserListItem,
  AdminCreateUserRequest,
  AdminUpdateUserRequest,
  Role,
  AdminCreateDoctorRequest,
  AdminUpdateDoctorRequest,
  PatientSummary,
  MedicineCatalogListResponse,
  MedicineCatalogSearchQuery,
  DoctorUpdateMedicineRequest,
  AdminResetUserPasswordRequest,
  PatientQueueResponse,
  RecentCompletedResponse,
  ToothDetail,
} from '@dms/types';

import { createClinicQueueWebSocket, type RealtimeMessage } from '@/lib/realtime';
import type { RootState } from './index';
import { setTokensFromRefresh, setUnauthenticated } from './authSlice';
import { clinicDateISO } from '../lib/clinicTime';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL && process.env.NEXT_PUBLIC_API_BASE_URL.length > 0
    ? process.env.NEXT_PUBLIC_API_BASE_URL
    : 'http://localhost:4000';

export interface PatientsListResponse {
  items: Patient[];
  nextCursor: string | null;
}

export interface ErrorResponse {
  error: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  traceId?: string;
}

export const TAG_TYPES = [
  'Patients',
  'Patient',
  'Doctors',
  'UserPreferences',
  'Followups',
  'Xrays',
  'Medicines',
  'Rx',
  'Visit',
  'Billing',

  'DailyPatientSummary',
  'DailyReport',
  'DailyVisitsBreakdown',
  'ClinicRealtime',
  'ClinicQueue',

  'AdminMedicines',
  'AdminRxPresets',
  'AdminUsers',
  'RxPresets',
  'MedicinesCatalog',
  'RecentCompleted',
] as const;

export type AdminMedicinesStatus = 'PENDING' | 'VERIFIED';

export type MeResponse = {
  userId: string;
  role: Role;
  email: string;
  displayName: string;
  active: boolean;
  doctorProfile: {
    doctorId: string;
    fullName: string;
    registrationNumber: string;
    specialization: string;
    contact?: string;
    active: boolean;
    createdAt: number;
    updatedAt: number;
  } | null;
};

export type UpdateMeRequest = {
  displayName?: string;
  doctorProfile?: {
    fullName?: string;
    contact?: string;
  };
};

export type DoctorPublicListItem = {
  doctorId: string;
  fullName: string;
  displayName?: string;
  registrationNumber: string;
  specialization: string;
  contact?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const state = getState() as RootState;
    const token = state.auth.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    headers.set('accept', 'application/json');
    return headers;
  },
});

function normalizeIsoDate(input: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  return clinicDateISO(new Date(input));
}

let refreshInFlight: Promise<boolean> | null = null;

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status !== 401) return result;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshResult = await rawBaseQuery(
        { url: '/auth/refresh', method: 'POST' },
        api,
        extraOptions,
      );

      if (refreshResult.data) {
        api.dispatch(setTokensFromRefresh(refreshResult.data as RefreshResponse));
        return true;
      }

      const status = (refreshResult.error as any)?.status;
      if (status === 401 || status === 403) {
        api.dispatch(setUnauthenticated());
        api.dispatch(apiSlice.util.resetApiState());
      }

      return false;
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  const ok = await refreshInFlight;
  if (!ok) return result;

  result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401) {
    api.dispatch(setUnauthenticated());
    api.dispatch(apiSlice.util.resetApiState());
  }

  return result;
};

type WsListener = (msg: RealtimeMessage) => void;

let sharedSocket: WebSocket | null = null;
let sharedListeners = new Set<WsListener>();
let sharedRefCount = 0;

let sharedHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let sharedIdleTimer: ReturnType<typeof setTimeout> | null = null;

function isSocketUsable(sock: WebSocket | null) {
  if (!sock) return false;
  return sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING;
}

let sharedEverOpened = false;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function clearReconnectTimer() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleReconnect(args: { dispatch: any; getState: () => unknown }) {
  if (typeof window === 'undefined') return;
  if (document.visibilityState !== 'visible') return;
  if (sharedRefCount <= 0) return;

  const base = Math.min(30_000, 500 * Math.pow(2, reconnectAttempt));
  const jitter = Math.floor(Math.random() * 250);
  const delay = base + jitter;
  reconnectAttempt += 1;

  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    void sharedOpenSocketIfNeeded(args, { force: true });
  }, delay);
}

const HEARTBEAT_MS = 4 * 60 * 1000;
const IDLE_CLOSE_MS = 10 * 60 * 1000;
const MAX_CONN_AGE_MS = 110 * 60 * 1000;
const EXPIRY_SKEW_MS = 30_000;

let recycleTimer: ReturnType<typeof setTimeout> | null = null;

function clearRecycleTimer() {
  if (recycleTimer) clearTimeout(recycleTimer);
  recycleTimer = null;
}

function getTodayIsoSafe() {
  return clinicDateISO(new Date());
}

function invalidateQueueOnly(dispatch: any, dateIso: string) {
  dispatch(apiSlice.util.invalidateTags([{ type: 'ClinicQueue' as const, id: dateIso }]));
}

function invalidateRealtimeDrivenCaches(args: { dispatch: any }) {
  const today = getTodayIsoSafe();
  invalidateQueueOnly(args.dispatch, today);
}

function sharedStopTimers() {
  if (sharedHeartbeatTimer) clearInterval(sharedHeartbeatTimer);
  if (sharedIdleTimer) clearTimeout(sharedIdleTimer);
  sharedHeartbeatTimer = null;
  sharedIdleTimer = null;

  clearRecycleTimer();
}

function sharedSafeClose() {
  if (!sharedSocket) return;
  try {
    sharedSocket.close();
  } catch {}
  sharedSocket = null;
  sharedStopTimers();
}

function sharedResetIdleTimer() {
  if (sharedIdleTimer) clearTimeout(sharedIdleTimer);
  sharedIdleTimer = setTimeout(() => {
    sharedSafeClose();
  }, IDLE_CLOSE_MS);
}

async function refreshAccessTokenShared(args: {
  dispatch: any;
  getState: () => unknown;
}): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshResult = await rawBaseQuery(
        { url: '/auth/refresh', method: 'POST' },
        { dispatch: args.dispatch, getState: args.getState } as any,
        {} as any,
      );

      if (refreshResult.data) {
        args.dispatch(setTokensFromRefresh(refreshResult.data as RefreshResponse));
        return true;
      }

      const status = (refreshResult.error as any)?.status;
      if (status === 401 || status === 403) {
        args.dispatch(setUnauthenticated());
        args.dispatch(apiSlice.util.resetApiState());
      }

      return false;
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  const ok = await refreshInFlight;
  if (!ok) return null;

  const s2 = args.getState() as RootState;
  return s2.auth.accessToken ?? null;
}

async function ensureFreshAccessTokenForWs(args: {
  dispatch: any;
  getState: () => unknown;
}): Promise<string | null> {
  const state = args.getState() as RootState;
  const token = state.auth.accessToken;
  const expiresAt = state.auth.accessExpiresAt;

  if (!token || !expiresAt) return null;

  if (Date.now() < expiresAt - EXPIRY_SKEW_MS) {
    return token;
  }

  return await refreshAccessTokenShared(args);
}

async function sharedOpenSocketIfNeeded(
  args: { dispatch: any; getState: () => unknown },
  opts?: { force?: boolean },
) {
  if (typeof window === 'undefined') return;
  if (document.visibilityState !== 'visible') return;

  if (!opts?.force && isSocketUsable(sharedSocket)) return;

  if (sharedSocket && !isSocketUsable(sharedSocket)) {
    sharedSafeClose();
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const token = await ensureFreshAccessTokenForWs(args);
  if (!token) return;

  const isReconnect = sharedEverOpened;

  sharedSocket = createClinicQueueWebSocket({
    token,

    onOpen: () => {
      sharedEverOpened = true;
      reconnectAttempt = 0;
      clearReconnectTimer();

      if (isReconnect) {
        invalidateRealtimeDrivenCaches({ dispatch: args.dispatch });
      }

      clearRecycleTimer();
      recycleTimer = setTimeout(() => {
        sharedSafeClose();
        void sharedOpenSocketIfNeeded(args, { force: true });
      }, MAX_CONN_AGE_MS);

      sharedResetIdleTimer();
    },

    onMessage: (msg) => {
      for (const fn of sharedListeners) {
        try {
          fn(msg);
        } catch {}
      }
      sharedResetIdleTimer();
    },

    onClose: () => {
      sharedSocket = null;
      sharedStopTimers();
      scheduleReconnect(args);
    },

    onError: () => {
      sharedSafeClose();
      scheduleReconnect(args);
    },
  });

  if (!sharedSocket) return;

  sharedHeartbeatTimer = setInterval(() => {
    const sock = sharedSocket;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    try {
      sock.send(JSON.stringify({ type: 'ping' }));
    } catch {}
  }, HEARTBEAT_MS);

  sharedResetIdleTimer();
}

function sharedMarkActivity(args: { dispatch: any; getState: () => unknown }) {
  sharedResetIdleTimer();

  if (!isSocketUsable(sharedSocket) && sharedRefCount > 0) {
    void sharedOpenSocketIfNeeded(args, { force: true });
  }
}

function subscribeSharedRealtime(args: {
  dispatch: any;
  getState: () => unknown;
  onMessage: WsListener;
}) {
  sharedRefCount += 1;
  sharedListeners.add(args.onMessage);

  const isFirst = sharedRefCount === 1;

  if (isFirst && typeof window !== 'undefined') {
    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart'] as const;

    const activityHandler = () => sharedMarkActivity(args);
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') sharedMarkActivity(args);
    };

    const focusHandler = () => sharedMarkActivity(args);
    const pageShowHandler = () => sharedMarkActivity(args);

    (window as any).__dms_ws_activityHandler = activityHandler;
    (window as any).__dms_ws_visibilityHandler = visibilityHandler;
    (window as any).__dms_ws_focusHandler = focusHandler;
    (window as any).__dms_ws_pageShowHandler = pageShowHandler;

    activityEvents.forEach((e) => window.addEventListener(e, activityHandler));
    document.addEventListener('visibilitychange', visibilityHandler);
    window.addEventListener('focus', focusHandler);
    window.addEventListener('pageshow', pageShowHandler);

    const onlineHandler = () => sharedMarkActivity(args);
    (window as any).__dms_ws_onlineHandler = onlineHandler;
    window.addEventListener('online', onlineHandler);
  }

  if (typeof window !== 'undefined' && document.visibilityState === 'visible') {
    void sharedOpenSocketIfNeeded(args);
  }

  return () => {
    sharedListeners.delete(args.onMessage);
    sharedRefCount = Math.max(0, sharedRefCount - 1);

    if (sharedRefCount === 0) {
      if (typeof window !== 'undefined') {
        const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart'] as const;

        const activityHandler = (window as any).__dms_ws_activityHandler as
          | (() => void)
          | undefined;
        const visibilityHandler = (window as any).__dms_ws_visibilityHandler as
          | (() => void)
          | undefined;

        const focusHandler = (window as any).__dms_ws_focusHandler as (() => void) | undefined;
        const pageShowHandler = (window as any).__dms_ws_pageShowHandler as
          | (() => void)
          | undefined;

        const onlineHandler = (window as any).__dms_ws_onlineHandler as (() => void) | undefined;

        if (activityHandler)
          activityEvents.forEach((e) => window.removeEventListener(e, activityHandler));
        if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
        if (focusHandler) window.removeEventListener('focus', focusHandler);
        if (pageShowHandler) window.removeEventListener('pageshow', pageShowHandler);
        if (onlineHandler) window.removeEventListener('online', onlineHandler);

        delete (window as any).__dms_ws_activityHandler;
        delete (window as any).__dms_ws_visibilityHandler;
        delete (window as any).__dms_ws_focusHandler;
        delete (window as any).__dms_ws_pageShowHandler;
        delete (window as any).__dms_ws_onlineHandler;

        clearReconnectTimer();
      }

      sharedSafeClose();
    }
  };
}

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  refetchOnMountOrArgChange: false,
  tagTypes: TAG_TYPES,

  endpoints: (builder) => ({
    clinicRealtime: builder.query<null, void>({
      queryFn: () => ({ data: null }),
      providesTags: () => [{ type: 'ClinicRealtime' as const, id: 'WS' }],
      async onCacheEntryAdded(_arg, { cacheDataLoaded, cacheEntryRemoved, dispatch, getState }) {
        await cacheDataLoaded;

        const unsubscribe = subscribeSharedRealtime({
          dispatch,
          getState,
          onMessage: (data) => {
            if (data.type !== 'ClinicQueueUpdated') return;

            const msgDate = normalizeIsoDate(data.payload.visitDate);
            invalidateQueueOnly(dispatch, msgDate);
          },
        });

        await cacheEntryRemoved;
        unsubscribe();
      },
    }),

    login: builder.mutation<LoginResponse, LoginRequestBody>({
      query: (body) => ({
        url: '/auth/login',
        method: 'POST',
        body,
      }),
    }),

    refresh: builder.mutation<RefreshResponse, void>({
      query: () => ({
        url: '/auth/refresh',
        method: 'POST',
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setTokensFromRefresh(data));
        } catch {}
      },
    }),

    logout: builder.mutation<{ ok: true }, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          dispatch(setUnauthenticated());
          dispatch(apiSlice.util.resetApiState());
        }
      },
    }),

    getDailyReport: builder.query<DailyReport, string>({
      query: (date) => ({
        url: '/reports/daily',
        params: { date },
      }),
      providesTags: (_r, _e, date) => [{ type: 'DailyReport' as const, id: date }],
    }),

    getDailyPatientSummary: builder.query<DailyPatientSummary, string>({
      query: (date) => ({
        url: '/reports/daily/patients',
        params: { date },
      }),
      providesTags: (_r, _e, date) => [{ type: 'DailyPatientSummary' as const, id: date }],
    }),

    getDailyPatientSummarySeries: builder.query<
      DailyPatientSummarySeries,
      { startDate: string; endDate: string }
    >({
      query: ({ startDate, endDate }) => ({
        url: '/reports/daily/patients/series',
        params: { startDate, endDate },
      }),
      providesTags: () => [{ type: 'DailyPatientSummary' as const, id: 'SERIES' }],
    }),

    getDailyVisitsBreakdown: builder.query<
      {
        date: string;
        totalVisits: number;
        items: {
          visitId: string;
          visitDate: string;
          status: 'QUEUED' | 'IN_PROGRESS' | 'DONE';
          tag?: 'N' | 'F';
          zeroBilled?: boolean;
          anchorVisitId?: string;
          reason?: string;
          billingAmount?: number;
          createdAt: number;
          updatedAt: number;

          patientId: string;
          patientName: string;
          patientPhone?: string;
          patientGender?: string;
        }[];
      },
      string
    >({
      query: (date) => ({
        url: '/reports/daily/visits-breakdown',
        params: { date },
      }),
      providesTags: (_r, _e, date) => [{ type: 'DailyVisitsBreakdown' as const, id: date }],
    }),

    getDoctors: builder.query<DoctorPublicListItem[], void>({
      query: () => ({
        url: '/doctors',
      }),
      providesTags: ['Doctors'],
    }),

    adminGetDoctors: builder.query<AdminDoctorListItem[], void>({
      query: () => ({
        url: '/admin/doctors',
      }),
      providesTags: ['Doctors'],
    }),

    getPatientQueue: builder.query<
      PatientQueueResponse,
      { date?: string; status?: 'QUEUED' | 'IN_PROGRESS' | 'DONE' }
    >({
      query: ({ date, status } = {}) => ({
        url: '/visits/queue',
        params: {
          ...(date ? { date } : {}),
          ...(status ? { status } : {}),
        },
      }),

      providesTags: (_r, _e, arg) => [
        {
          type: 'ClinicQueue' as const,
          id: arg.date ?? clinicDateISO(new Date()),
        },
      ],
    }),

    getPatients: builder.query<PatientsListResponse, Partial<PatientSearchQuery>>({
      query: ({ query, limit, cursor } = {}) => ({
        url: '/patients',
        params: {
          ...(query ? { query } : {}),
          ...(limit ? { limit } : {}),
          ...(cursor ? { cursor } : {}),
        },
      }),
      providesTags: (result) =>
        result?.items
          ? [
              ...result.items.map((p) => ({ type: 'Patient' as const, id: p.patientId })),
              { type: 'Patients' as const, id: 'LIST' },
            ]
          : [{ type: 'Patients' as const, id: 'LIST' }],
    }),

    createPatient: builder.mutation<Patient, PatientCreate>({
      query: (body) => ({
        url: '/patients',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Patients' as const, id: 'LIST' }],
    }),

    getPatientById: builder.query<Patient, string>({
      query: (patientId) => ({
        url: `/patients/${patientId}`,
      }),
      providesTags: (_result, _error, id) => [{ type: 'Patient' as const, id }],
    }),

    getPatientVisits: builder.query<{ items: Visit[] }, string>({
      query: (patientId) => ({
        url: `/patients/${patientId}/visits`,
      }),
      providesTags: (_result, _error, patientId) => [{ type: 'Patient' as const, id: patientId }],
    }),

    createVisit: builder.mutation<VisitCreateResponse, VisitCreate>({
      query: (body) => ({
        url: '/visits',
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'ClinicQueue' as const, id: clinicDateISO(new Date()) },
        { type: 'Patients' as const, id: 'LIST' },
        { type: 'Patient' as const, id: arg.patientId },
      ],
    }),

    takeSeat: builder.mutation<Visit, { visitId: string; date?: string }>({
      query: ({ visitId }) => ({
        url: '/visits/queue/take-seat',
        method: 'POST',
        body: { visitId },
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'Visit' as const, id: arg.visitId },
        { type: 'ClinicQueue' as const, id: arg.date ?? clinicDateISO(new Date()) },
      ],
    }),

    updateVisitStatus: builder.mutation<
      Visit,
      { visitId: string; status: 'IN_PROGRESS' | 'DONE'; date?: string }
    >({
      query: ({ visitId, status }) => ({
        url: `/visits/${visitId}/status`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'Visit' as const, id: arg.visitId },
        { type: 'ClinicQueue' as const, id: arg.date ?? clinicDateISO(new Date()) },
      ],
    }),

    getVisitBill: builder.query<Billing, { visitId: string }>({
      query: ({ visitId }) => ({
        url: `/visits/${visitId}/bill`,
        method: 'GET',
      }),
      providesTags: (_r, _e, arg) => [{ type: 'Billing' as const, id: arg.visitId }],
    }),

    checkoutVisit: builder.mutation<Billing, { visitId: string; input: BillingCheckoutInput }>({
      query: ({ visitId, input }) => ({
        url: `/visits/${visitId}/checkout`,
        method: 'POST',
        body: input,
      }),
      invalidatesTags: (_r, _e, arg) => [
        { type: 'Billing' as const, id: arg.visitId },
        { type: 'Visit' as const, id: arg.visitId },
      ],
    }),

    getDailyFollowups: builder.query<
      {
        items: {
          followupId: string;
          visitId: string;
          followUpDate: string;
          reason?: string;
          contactMethod: string;
          status: string;
          createdAt: number;
          updatedAt: number;
          patientId: string;
          patientName: string;
          patientPhone?: string;
        }[];
      },
      string
    >({
      query: (date) => ({
        url: '/followups/daily',
        params: { date },
      }),
      providesTags: (_result, _error, date) => [{ type: 'Followups' as const, id: date }],
    }),

    updateFollowupStatus: builder.mutation<
      {
        followupId: string;
        visitId: string;
        followUpDate: string;
        status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
        createdAt: number;
        updatedAt: number;
      },
      {
        visitId: string;
        followupId: string;
        status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
        dateTag?: string;
      }
    >({
      query: ({ visitId, followupId, status }) => ({
        url: `/visits/${visitId}/followups/${followupId}/status`,
        method: 'PATCH',
        body: { status },
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const patch =
          (arg.status === 'COMPLETED' || arg.status === 'CANCELLED') && arg.dateTag
            ? dispatch(
                apiSlice.util.updateQueryData('getDailyFollowups', arg.dateTag, (draft) => {
                  draft.items = (draft.items ?? []).filter((x) => x.followupId !== arg.followupId);
                }),
              )
            : null;

        try {
          await queryFulfilled;
        } catch {
          patch?.undo();
        }
      },
      invalidatesTags: (_r, _e, arg) => {
        if (!arg.dateTag) return ['Followups'];
        return arg.status === 'ACTIVE' ? [{ type: 'Followups' as const, id: arg.dateTag }] : [];
      },
    }),

    presignXrayUpload: builder.mutation<
      {
        xrayId: string;
        key: string;
        uploadUrl: string;
        headers: Record<string, string>;
        expiresInSeconds: number;
      },
      { visitId: string; contentType: XrayContentType; size: number }
    >({
      query: (body) => ({
        url: '/xrays/presign',
        method: 'POST',
        body,
      }),
    }),

    registerXrayMetadata: builder.mutation<
      Xray,
      {
        visitId: string;
        xrayId: string;
        contentType: XrayContentType;
        size: number;
        takenAt: number;
        contentKey: string;
      }
    >({
      query: ({ visitId, ...body }) => ({
        url: `/visits/${visitId}/xrays`,
        method: 'POST',
        body: { ...body },
      }),
      invalidatesTags: (_r, _e, arg) => [{ type: 'Xrays' as const, id: arg.visitId }],
    }),

    listVisitXrays: builder.query<{ items: Xray[] }, { visitId: string }>({
      query: ({ visitId }) => ({
        url: `/visits/${visitId}/xrays`,
        method: 'GET',
      }),
      providesTags: (_r, _e, arg) => [{ type: 'Xrays' as const, id: arg.visitId }],
    }),

    deleteXray: builder.mutation<{ ok: true }, { visitId: string; xrayId: string }>({
      query: ({ xrayId }) => ({
        url: `/xrays/${xrayId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, arg) => [{ type: 'Xrays' as const, id: arg.visitId }],
    }),

    getXrayUrl: builder.query<
      { url: string; variant: 'thumb' | 'original' },
      { xrayId: string; size?: 'thumb' | 'original' }
    >({
      query: ({ xrayId, size }) => ({
        url: `/xrays/${xrayId}/url`,
        method: 'GET',
        params: size ? { size } : undefined,
      }),
    }),

    searchMedicines: builder.query<
      { items: MedicineTypeaheadItem[] },
      { query: string; limit?: number }
    >({
      query: ({ query, limit }) => ({
        url: '/medicines',
        params: {
          query,
          ...(typeof limit === 'number' ? { limit } : {}),
        },
      }),
      providesTags: (_r, _e, arg) => [{ type: 'Medicines' as const, id: arg.query }],
    }),

    quickAddMedicine: builder.mutation<MedicineTypeaheadItem, QuickAddMedicineInput>({
      query: (body) => ({
        url: '/medicines/quick-add',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Medicines'],
    }),

    adminListMedicines: builder.query<AdminMedicineListResponse, Partial<AdminMedicineSearchQuery>>(
      {
        query: ({ query, limit, cursor, status } = {} as any) => ({
          url: '/admin/medicines',
          params: {
            ...(query ? { query } : {}),
            ...(typeof limit === 'number' ? { limit } : {}),
            ...(cursor ? { cursor } : {}),
            ...(status ? { status } : {}),
          },
        }),
        providesTags: () => [{ type: 'AdminMedicines' as const, id: 'LIST' }],
      },
    ),

    adminCreateMedicine: builder.mutation<
      MedicinePreset,
      {
        displayName: string;
        defaultDose?: string;
        defaultFrequency?: string;
        defaultDuration?: number;
        form?: MedicineForm;
      }
    >({
      query: (body) => ({
        url: '/admin/medicines',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'AdminMedicines' as const, id: 'LIST' }],
    }),

    adminUpdateMedicine: builder.mutation<
      MedicinePreset,
      { id: string; patch: AdminUpdateMedicineRequest }
    >({
      query: ({ id, patch }) => ({
        url: `/admin/medicines/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: [{ type: 'AdminMedicines' as const, id: 'LIST' }],
    }),

    adminDeleteMedicine: builder.mutation<{ ok: true }, { id: string }>({
      query: ({ id }) => ({
        url: `/admin/medicines/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'AdminMedicines' as const, id: 'LIST' }],
    }),

    adminVerifyMedicine: builder.mutation<MedicinePreset, { id: string }>({
      query: ({ id }) => ({
        url: `/admin/medicines/${id}/verify`,
        method: 'POST',
      }),
      invalidatesTags: [{ type: 'AdminMedicines' as const, id: 'LIST' }],
    }),

    listMedicinesCatalog: builder.query<
      MedicineCatalogListResponse,
      Partial<MedicineCatalogSearchQuery>
    >({
      query: ({ query, limit, cursor } = {}) => ({
        url: '/medicines/catalog',
        params: {
          ...(query ? { query } : {}),
          ...(typeof limit === 'number' ? { limit } : {}),
          ...(cursor ? { cursor } : {}),
        },
      }),
      providesTags: () => [{ type: 'MedicinesCatalog' as const, id: 'LIST' }],
    }),

    doctorUpdateMedicine: builder.mutation<
      MedicinePreset,
      { id: string; patch: DoctorUpdateMedicineRequest }
    >({
      query: ({ id, patch }) => ({
        url: `/medicines/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: [{ type: 'MedicinesCatalog' as const, id: 'LIST' }],
    }),

    doctorDeleteMedicine: builder.mutation<{ ok: true }, { id: string }>({
      query: ({ id }) => ({
        url: `/medicines/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'MedicinesCatalog' as const, id: 'LIST' }],
    }),

    getRxPresets: builder.query<
      { items: PrescriptionPreset[] },
      Partial<PrescriptionPresetSearchQuery>
    >({
      query: ({ query, limit, filter } = {}) => ({
        url: '/rx-presets',
        params: {
          ...(query ? { query } : {}),
          ...(typeof limit === 'number' ? { limit } : {}),
          ...(filter ? { filter } : {}),
        },
      }),
      providesTags: () => [{ type: 'RxPresets' as const, id: 'LIST' }],
    }),

    adminListRxPresets: builder.query<AdminRxPresetListResponse, Partial<AdminRxPresetSearchQuery>>(
      {
        query: ({ query, limit, cursor } = {}) => ({
          url: '/admin/rx-presets',
          params: {
            ...(query ? { query } : {}),
            ...(typeof limit === 'number' ? { limit } : {}),
            ...(cursor ? { cursor } : {}),
          },
        }),
        providesTags: () => [{ type: 'AdminRxPresets' as const, id: 'LIST' }],
      },
    ),

    adminDeleteRxPreset: builder.mutation<{ ok: true }, { id: string }>({
      query: ({ id }) => ({
        url: `/admin/rx-presets/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'AdminRxPresets' as const, id: 'LIST' }],
    }),

    getRxPresetById: builder.query<PrescriptionPreset, { id: string }>({
      query: ({ id }) => ({
        url: `/rx-presets/${id}`,
        method: 'GET',
      }),
      providesTags: (_r, _e, arg) => [{ type: 'RxPresets' as const, id: arg.id }],
    }),

    createRxPreset: builder.mutation<
      PrescriptionPreset,
      { name: string; lines: RxLineType[]; tags?: string[]; scope?: any }
    >({
      query: (body) => ({
        url: '/rx-presets',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'RxPresets' as const, id: 'LIST' }],
    }),

    updateRxPreset: builder.mutation<PrescriptionPreset, { id: string; patch: any }>({
      query: ({ id, patch }) => ({
        url: `/rx-presets/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: (_r, _e, arg) => [
        { type: 'RxPresets' as const, id: 'LIST' },
        { type: 'RxPresets' as const, id: arg.id },
      ],
    }),

    deleteRxPreset: builder.mutation<{ ok: true }, { id: string }>({
      query: ({ id }) => ({
        url: `/rx-presets/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'RxPresets' as const, id: 'LIST' }],
    }),

    upsertVisitRx: builder.mutation<
      { rxId: string; visitId: string; version: number; createdAt: number; updatedAt: number },
      { visitId: string; lines: RxLineType[]; toothDetails?: ToothDetail[]; doctorNotes?: string }
    >({
      query: ({ visitId, lines, toothDetails, doctorNotes }) => ({
        url: `/visits/${visitId}/rx`,
        method: 'POST',
        body: {
          lines: lines ?? [],
          ...(toothDetails !== undefined ? { toothDetails } : {}),
          ...(doctorNotes !== undefined ? { doctorNotes } : {}),
        },
      }),
      invalidatesTags: (_r, _e, arg) => [{ type: 'Rx' as const, id: arg.visitId }],
    }),

    getVisitById: builder.query<Visit, string>({
      query: (visitId) => ({
        url: `/visits/${visitId}`,
        method: 'GET',
      }),
      providesTags: (_result, _error, visitId) => [{ type: 'Visit' as const, id: visitId }],
    }),

    getVisitRx: builder.query<{ rx: Prescription | null }, { visitId: string; version?: number }>({
      query: ({ visitId, version }) => ({
        url: `/visits/${visitId}/rx`,
        method: 'GET',
        params: typeof version === 'number' ? { version } : undefined,
      }),
      providesTags: (_r, _e, arg) => [{ type: 'Rx' as const, id: arg.visitId }],
    }),

    getVisitRxVersions: builder.query<{ versions: number[] }, { visitId: string }>({
      query: ({ visitId }) => ({
        url: `/visits/${visitId}/rx/versions`,
        method: 'GET',
      }),
      providesTags: (_r, _e, arg) => [{ type: 'Rx' as const, id: arg.visitId }],
    }),

    updateVisitRxReceptionNotes: builder.mutation<
      { rx: Prescription },
      { visitId: string; receptionNotes: string }
    >({
      query: ({ visitId, receptionNotes }) => ({
        url: `/visits/${visitId}/rx/reception-notes`,
        method: 'PATCH',
        body: { receptionNotes },
      }),
      invalidatesTags: (_r, _e, arg) => [{ type: 'Rx' as const, id: arg.visitId }],
    }),

    updateVisitRxDoctorNotes: builder.mutation<
      { rx: Prescription },
      { visitId: string; doctorNotes: string }
    >({
      query: ({ visitId, doctorNotes }) => ({
        url: `/visits/${visitId}/rx/doctor-notes`,
        method: 'PATCH',
        body: { doctorNotes },
      }),
      invalidatesTags: (_r, _e, arg) => [{ type: 'Rx' as const, id: arg.visitId }],
    }),

    startVisitRxRevision: builder.mutation<
      { rxId: string; visitId: string; version: number; createdAt: number; updatedAt: number },
      { visitId: string }
    >({
      query: ({ visitId }) => ({
        url: `/visits/${visitId}/rx/revisions`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, arg) => [{ type: 'Rx' as const, id: arg.visitId }],
    }),

    updateRxById: builder.mutation<
      { rxId: string; visitId: string; version: number; createdAt: number; updatedAt: number },
      { rxId: string; lines: RxLineType[]; toothDetails?: ToothDetail[]; doctorNotes?: string }
    >({
      query: ({ rxId, lines, toothDetails, doctorNotes }) => ({
        url: `/rx/${rxId}`,
        method: 'PUT',
        body: {
          lines: lines ?? [],
          ...(toothDetails !== undefined ? { toothDetails } : {}),
          ...(doctorNotes !== undefined ? { doctorNotes } : {}),
        },
      }),
    }),

    adminCreateRxPreset: builder.mutation<
      PrescriptionPreset,
      { name: string; lines: RxLineType[]; tags?: string[] }
    >({
      query: (body) => ({
        url: '/admin/rx-presets',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'AdminRxPresets' as const, id: 'LIST' }],
    }),

    adminGetRxPresetById: builder.query<PrescriptionPreset, { id: string }>({
      query: ({ id }) => ({
        url: `/admin/rx-presets/${id}`,
        method: 'GET',
      }),
      providesTags: (_r, _e, arg) => [{ type: 'AdminRxPresets' as const, id: arg.id }],
    }),

    adminUpdateRxPreset: builder.mutation<
      PrescriptionPreset,
      { id: string; patch: { name?: string; lines?: any[]; tags?: string[] } }
    >({
      query: ({ id, patch }) => ({
        url: `/admin/rx-presets/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: (_r, _e, arg) => [
        { type: 'AdminRxPresets' as const, id: 'LIST' },
        { type: 'AdminRxPresets' as const, id: arg.id },
      ],
    }),

    adminListUsers: builder.query<
      { items: AdminUserListItem[] },
      { query?: string; role?: Role; active?: boolean } | void
    >({
      query: (args) => ({
        url: '/admin/users',
        params: args
          ? {
              ...(args.query ? { query: args.query } : {}),
              ...(args.role ? { role: args.role } : {}),
              ...(typeof args.active === 'boolean' ? { active: String(args.active) } : {}),
            }
          : undefined,
      }),
      providesTags: () => [{ type: 'AdminUsers' as const, id: 'LIST' }],
    }),

    adminCreateUser: builder.mutation<AdminUserListItem, AdminCreateUserRequest>({
      query: (body) => ({
        url: '/admin/users',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'AdminUsers' as const, id: 'LIST' }],
    }),

    adminUpdateUser: builder.mutation<
      AdminUserListItem,
      { userId: string; patch: AdminUpdateUserRequest }
    >({
      query: ({ userId, patch }) => ({
        url: `/admin/users/${userId}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: [{ type: 'AdminUsers' as const, id: 'LIST' }],
    }),

    adminDeleteUser: builder.mutation<{ ok: true }, { userId: string }>({
      query: ({ userId }) => ({
        url: `/admin/users/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'AdminUsers' as const, id: 'LIST' }],
    }),

    adminCreateDoctor: builder.mutation<AdminDoctorListItem, AdminCreateDoctorRequest>({
      query: (body) => ({
        url: '/admin/doctors',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Doctors'],
    }),

    adminUpdateDoctor: builder.mutation<
      AdminDoctorListItem,
      { doctorId: string; patch: AdminUpdateDoctorRequest }
    >({
      query: ({ doctorId, patch }) => ({
        url: `/admin/doctors/${doctorId}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: ['Doctors'],
    }),

    getMe: builder.query<MeResponse, void>({
      query: () => ({
        url: '/me',
        method: 'GET',
      }),
    }),

    updateMe: builder.mutation<MeResponse, UpdateMeRequest>({
      query: (body) => ({
        url: '/me',
        method: 'PATCH',
        body,
      }),
    }),

    createVisitFollowup: builder.mutation<
      {
        followupId: string;
        visitId: string;
        followUpDate: string;
        status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
        createdAt: number;
        updatedAt: number;
      },
      {
        visitId: string;
        followUpDate: string;
        reason?: string;
        contactMethod?: 'CALL' | 'SMS' | 'WHATSAPP';
      }
    >({
      query: ({ visitId, ...body }) => ({
        url: `/visits/${visitId}/followups`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, arg) => [{ type: 'Followups' as const, id: arg.followUpDate }],
    }),

    getPatientSummary: builder.query<PatientSummary, string>({
      query: (patientId) => ({
        url: `/patients/${patientId}/summary`,
      }),
      providesTags: (_r, _e, patientId) => [{ type: 'Patient' as const, id: patientId }],
    }),

    adminResetUserPassword: builder.mutation<
      { ok: true },
      { userId: string; body: AdminResetUserPasswordRequest }
    >({
      query: ({ userId, body }) => ({
        url: `/admin/users/${userId}/reset-password`,
        method: 'POST',
        body,
      }),
    }),

    getRecentCompleted: builder.query<RecentCompletedResponse, { date?: string; limit?: number }>({
      query: ({ date, limit } = {}) => ({
        url: '/reports/daily/recent-completed',
        params: {
          ...(date ? { date } : {}),
          ...(typeof limit === 'number' ? { limit } : {}),
        },
      }),
      providesTags: (_r, _e, arg) => [
        { type: 'RecentCompleted' as const, id: arg.date ?? clinicDateISO(new Date()) }, // ✅ FIX
      ],
    }),
  }),
});

export const {
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,

  useClinicRealtimeQuery,

  useGetPatientsQuery,
  useCreatePatientMutation,
  useGetPatientByIdQuery,
  useGetPatientVisitsQuery,

  useGetDailyReportQuery,
  useGetDailyPatientSummaryQuery,
  useGetDailyPatientSummarySeriesQuery,
  useGetDailyVisitsBreakdownQuery,

  useGetDoctorsQuery,
  useAdminGetDoctorsQuery,

  useGetMeQuery,
  useUpdateMeMutation,

  useGetPatientQueueQuery,

  useCreateVisitMutation,
  useTakeSeatMutation,
  useUpdateVisitStatusMutation,

  useGetVisitBillQuery,
  useCheckoutVisitMutation,

  useGetDailyFollowupsQuery,
  useUpdateFollowupStatusMutation,

  usePresignXrayUploadMutation,
  useRegisterXrayMetadataMutation,
  useListVisitXraysQuery,
  useDeleteXrayMutation,
  useGetXrayUrlQuery,

  useSearchMedicinesQuery,
  useLazySearchMedicinesQuery,
  useQuickAddMedicineMutation,

  useAdminListMedicinesQuery,
  useAdminCreateMedicineMutation,
  useAdminUpdateMedicineMutation,
  useAdminDeleteMedicineMutation,
  useAdminVerifyMedicineMutation,

  useGetRxPresetsQuery,
  useAdminListRxPresetsQuery,
  useAdminCreateRxPresetMutation,
  useAdminDeleteRxPresetMutation,
  useAdminGetRxPresetByIdQuery,
  useAdminUpdateRxPresetMutation,

  useGetRxPresetByIdQuery,
  useCreateRxPresetMutation,
  useUpdateRxPresetMutation,
  useDeleteRxPresetMutation,

  useUpsertVisitRxMutation,
  useGetVisitByIdQuery,
  useGetVisitRxQuery,
  useGetVisitRxVersionsQuery,
  useUpdateVisitRxReceptionNotesMutation,
  useUpdateVisitRxDoctorNotesMutation,
  useStartVisitRxRevisionMutation,
  useUpdateRxByIdMutation,

  useAdminListUsersQuery,
  useAdminCreateUserMutation,
  useAdminUpdateUserMutation,
  useAdminDeleteUserMutation,
  useAdminCreateDoctorMutation,
  useAdminUpdateDoctorMutation,

  useGetPatientSummaryQuery,
  useCreateVisitFollowupMutation,

  useListMedicinesCatalogQuery,
  useDoctorUpdateMedicineMutation,
  useDoctorDeleteMedicineMutation,
  useAdminResetUserPasswordMutation,
  useGetRecentCompletedQuery,
} = apiSlice;

export const api = apiSlice;
