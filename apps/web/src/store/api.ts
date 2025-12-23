// apps/web/src/store/api.ts
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
  UserPreferences,
  AdminDoctorListItem,
  Visit,
  VisitCreate,
  DoctorPatientsCountSeries,
  DailyVisitsBreakdownResponse,
  DoctorDailyVisitsBreakdownResponse,
  DoctorRecentCompletedResponse,
  Xray,
  XrayContentType,
  DoctorQueueResponse,
  MedicineTypeaheadItem,
  QuickAddMedicineInput,
  RxLineType,
} from '@dms/types';

import { createDoctorQueueWebSocket, type RealtimeMessage } from '@/lib/realtime';
import type { RootState } from './index';
import { setTokensFromRefresh, setUnauthenticated } from './authSlice';

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
] as const;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const state = getState() as unknown as RootState;
    const token = state.auth.accessToken;

    if (token) headers.set('authorization', `Bearer ${token}`);
    headers.set('accept', 'application/json');
    return headers;
  },
});

/**
 * Important: Avoid reauth recursion and avoid noisy auth endpoints triggering refresh.
 */
const isAuthEndpoint = (args: string | FetchArgs) => {
  const url = typeof args === 'string' ? args : args.url;
  // Normalize to path-only checks
  return (
    url === '/auth/login' ||
    url === '/auth/refresh' ||
    url === '/auth/logout' ||
    url.startsWith('/auth/login?') ||
    url.startsWith('/auth/refresh?') ||
    url.startsWith('/auth/logout?')
  );
};

/**
 * Single-flight refresh across concurrent 401s.
 * (Module-level, not on the `api` object — which is not a stable shared storage.)
 */
let refreshInFlight: Promise<boolean> | null = null;

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  // Never attempt refresh logic for auth endpoints themselves.
  if (isAuthEndpoint(args)) {
    return rawBaseQuery(args, api, extraOptions);
  }

  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status !== 401) return result;

  // If we get 401, attempt refresh once (single-flight).
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

      /**
       * DO NOT call /auth/logout here.
       * If cookie is missing/blocked/mismatched host, logout call adds more noise and can
       * create redirect loops. We simply mark unauthenticated and let the UI redirect.
       */
      api.dispatch(setUnauthenticated());
      api.dispatch(apiSlice.util.resetApiState());
      return false;
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  const ok = await refreshInFlight;

  if (!ok) {
    return result; // original 401 stands; UI will handle unauth state
  }

  // retry original call once after refresh
  result = await rawBaseQuery(args, api, extraOptions);

  // If still 401 after refresh, mark unauthenticated (no logout call here either)
  if (result.error?.status === 401) {
    api.dispatch(setUnauthenticated());
    api.dispatch(apiSlice.util.resetApiState());
  }

  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  refetchOnMountOrArgChange: false,
  tagTypes: TAG_TYPES,

  endpoints: (builder) => ({
    // --- Auth ---
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
        } catch {
          // callers decide what to do; baseQuery will NOT recursively refresh now
        }
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

    // --- Reports / Dashboard ---
    getDailyReport: builder.query<DailyReport, string>({
      query: (date) => ({
        url: '/reports/daily',
        params: { date },
      }),
    }),

    getDailyPatientSummary: builder.query<DailyPatientSummary, string>({
      query: (date) => ({
        url: '/reports/daily/patients',
        params: { date },
      }),
    }),

    getDailyPatientSummarySeries: builder.query<
      DailyPatientSummarySeries,
      { startDate: string; endDate: string }
    >({
      query: ({ startDate, endDate }) => ({
        url: '/reports/daily/patients/series',
        params: { startDate, endDate },
      }),
    }),

    getDailyVisitsBreakdown: builder.query<DailyVisitsBreakdownResponse, string>({
      query: (date) => ({
        url: '/reports/daily/visits-breakdown',
        params: { date },
      }),
    }),

    getDoctorDailyPatientSummarySeries: builder.query<
      DailyPatientSummarySeries,
      { startDate: string; endDate: string }
    >({
      query: ({ startDate, endDate }) => ({
        url: '/reports/daily/doctor/patients/series',
        params: { startDate, endDate },
      }),
    }),

    getDoctorDailyVisitsBreakdown: builder.query<DoctorDailyVisitsBreakdownResponse, string>({
      query: (date) => ({
        url: '/reports/daily/doctor/visits-breakdown',
        params: { date },
      }),
    }),

    getDoctors: builder.query<AdminDoctorListItem[], void>({
      query: () => ({
        url: '/admin/doctors',
      }),
      providesTags: ['Doctors'],
    }),

    // --- Me ---
    getMyPreferences: builder.query<UserPreferences, void>({
      query: () => ({
        url: '/me/preferences',
      }),
      providesTags: ['UserPreferences'],
    }),

    updateMyPreferences: builder.mutation<UserPreferences, UserPreferences>({
      query: (body) => ({
        url: '/me/preferences',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['UserPreferences'],
    }),

    // --- Patients ---
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

    // --- Visits / Queue ---
    getDoctorQueue: builder.query<
      DoctorQueueResponse,
      { doctorId: string; date?: string; status?: 'QUEUED' | 'IN_PROGRESS' | 'DONE' }
    >({
      query: ({ doctorId, date, status }) => ({
        url: '/visits/queue',
        params: {
          doctorId,
          ...(date ? { date } : {}),
          ...(status ? { status } : {}),
        },
      }),
      providesTags: (_result, _error, args) => [{ type: 'Doctors' as const, id: args.doctorId }],

      /**
       * Token-aware WS connection.
       * Reconnects when accessToken changes (refresh flow), preventing stale-token sockets.
       */
      async onCacheEntryAdded(arg, { cacheDataLoaded, cacheEntryRemoved, dispatch, getState }) {
        await cacheDataLoaded;

        type SocketT = ReturnType<typeof createDoctorQueueWebSocket>;
        let socket: SocketT = null;

        const HEARTBEAT_MS = 5 * 60 * 1000; // 5 min
        const IDLE_CLOSE_MS = 10 * 60 * 1000; // 10 min inactivity
        const EXPIRY_SKEW_MS = 30_000; // refresh 30s early

        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        let idleTimer: ReturnType<typeof setTimeout> | null = null;

        const safeClose = () => {
          if (!socket) return;
          try {
            socket.close();
          } catch {}
          socket = null;
        };

        const stopTimers = () => {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (idleTimer) clearTimeout(idleTimer);
          heartbeatTimer = null;
          idleTimer = null;
        };

        const getAuth = () => {
          const state = getState() as unknown as RootState;
          return {
            token: state.auth.accessToken,
            expiresAt: state.auth.accessExpiresAt,
          };
        };

        /**
         * Ensure access token is valid before WS connect.
         * Refresh ONLY when required.
         */
        const ensureFreshAccessToken = async (): Promise<string | null> => {
          const { token, expiresAt } = getAuth();
          if (!token || !expiresAt) return null;

          if (Date.now() < expiresAt - EXPIRY_SKEW_MS) {
            return token;
          }

          const refreshResult = await rawBaseQuery(
            { url: '/auth/refresh', method: 'POST' },
            { dispatch, getState } as any,
            {} as any,
          );

          if (refreshResult.data) {
            dispatch(setTokensFromRefresh(refreshResult.data as RefreshResponse));
            const s2 = getState() as unknown as RootState;
            return s2.auth.accessToken ?? null;
          }

          dispatch(setUnauthenticated());
          dispatch(apiSlice.util.resetApiState());
          return null;
        };

        const openSocketIfActive = async () => {
          if (document.visibilityState !== 'visible') return;

          const token = await ensureFreshAccessToken();
          if (!token) return;

          safeClose();

          socket = createDoctorQueueWebSocket({
            token,
            onMessage: (data: RealtimeMessage) => {
              if (data.type !== 'DoctorQueueUpdated') return;
              if (data.payload.doctorId !== arg.doctorId) return;
              if (arg.date && arg.date !== data.payload.visitDate) return;

              dispatch(
                apiSlice.util.invalidateTags([{ type: 'Doctors' as const, id: arg.doctorId }]),
              );
            },
          });

          if (!socket) return;

          heartbeatTimer = setInterval(() => {
            try {
              socket?.send(JSON.stringify({ type: 'ping' }));
            } catch {}
          }, HEARTBEAT_MS);

          resetIdleTimer();
        };

        const resetIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            stopTimers();
            safeClose();
          }, IDLE_CLOSE_MS);
        };

        const markActivity = () => {
          resetIdleTimer();
          if (!socket) {
            void openSocketIfActive();
          }
        };

        // initial connect if visible
        if (document.visibilityState === 'visible') {
          void openSocketIfActive();
        }

        // activity listeners
        const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart'];
        activityEvents.forEach((e) => window.addEventListener(e, markActivity));

        const onVisibility = () => {
          if (document.visibilityState === 'visible') {
            resetIdleTimer();
            if (!socket) {
              void openSocketIfActive();
            }
          }
          // when hidden → do nothing
          // idle timer will handle closing
        };

        document.addEventListener('visibilitychange', onVisibility);

        await cacheEntryRemoved;

        // cleanup
        activityEvents.forEach((e) => window.removeEventListener(e, markActivity));
        document.removeEventListener('visibilitychange', onVisibility);
        stopTimers();
        safeClose();
      },
    }),

    createVisit: builder.mutation<Visit, VisitCreate>({
      query: (body) => ({
        url: '/visits',
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'Doctors' as const, id: arg.doctorId },
        { type: 'Patients' as const, id: 'LIST' },
        { type: 'Patient' as const, id: arg.patientId },
      ],
    }),

    takeSeat: builder.mutation<Visit, { visitId: string; doctorId: string; date?: string }>({
      query: ({ visitId }) => ({
        url: '/visits/queue/take-seat',
        method: 'POST',
        body: { visitId },
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'Doctors' as const, id: arg.doctorId }],
    }),

    updateVisitStatus: builder.mutation<
      Visit,
      { visitId: string; status: 'IN_PROGRESS' | 'DONE'; doctorId: string; date?: string }
    >({
      query: ({ visitId, status }) => ({
        url: `/visits/${visitId}/status`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'Doctors' as const, id: arg.doctorId }],
    }),

    // --- Followups ---
    getDailyFollowups: builder.query<
      {
        items: {
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

    // --- Doctor charts ---
    getDoctorPatientsCountSeries: builder.query<
      DoctorPatientsCountSeries,
      { startDate: string; endDate: string }
    >({
      query: ({ startDate, endDate }) => ({
        url: '/reports/daily/doctor/patients/series',
        params: { startDate, endDate },
      }),
    }),

    getDoctorRecentCompleted: builder.query<
      DoctorRecentCompletedResponse,
      { date?: string; limit?: number }
    >({
      query: ({ date, limit } = {}) => ({
        url: '/reports/daily/doctor/recent-completed',
        params: {
          ...(date ? { date } : {}),
          ...(typeof limit === 'number' ? { limit } : {}),
        },
      }),
    }),

    // --- Xray ---
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

    upsertVisitRx: builder.mutation<
      { rxId: string; visitId: string; version: number; createdAt: number; updatedAt: number },
      { visitId: string; lines: RxLineType[] }
    >({
      query: ({ visitId, lines }) => ({
        url: `/visits/${visitId}/rx`,
        method: 'POST',
        body: { lines },
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
  }),
});

export const {
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,

  useGetPatientsQuery,
  useCreatePatientMutation,
  useGetPatientByIdQuery,
  useGetPatientVisitsQuery,

  useGetDailyReportQuery,
  useGetDailyPatientSummaryQuery,
  useGetDailyPatientSummarySeriesQuery,
  useGetDailyVisitsBreakdownQuery,

  useGetDoctorDailyPatientSummarySeriesQuery,
  useGetDoctorDailyVisitsBreakdownQuery,
  useGetDoctorsQuery,

  useGetMyPreferencesQuery,
  useUpdateMyPreferencesMutation,

  useGetDoctorQueueQuery,
  useCreateVisitMutation,
  useTakeSeatMutation,
  useUpdateVisitStatusMutation,

  useGetDailyFollowupsQuery,

  useGetDoctorPatientsCountSeriesQuery,
  useGetDoctorRecentCompletedQuery,

  usePresignXrayUploadMutation,
  useRegisterXrayMetadataMutation,
  useListVisitXraysQuery,
  useGetXrayUrlQuery,

  useSearchMedicinesQuery,
  useLazySearchMedicinesQuery,
  useQuickAddMedicineMutation,
  useUpsertVisitRxMutation,
  useGetVisitByIdQuery,
} = apiSlice;

export const api = apiSlice;
