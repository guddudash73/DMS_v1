// apps/web/src/store/api.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import type { FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';

import type {
  LoginRequest as LoginRequestBody,
  LoginResponse,
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

type RootStateShape = RootState & {
  auth?: {
    accessToken?: string;
    refreshToken?: string;
  };
};

export const TAG_TYPES = [
  'Patients',
  'Patient',
  'Doctors',
  'UserPreferences',
  'Followups',
] as const;
type TagType = (typeof TAG_TYPES)[number];

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const state = getState() as RootStateShape;
    const token = state.auth?.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    headers.set('accept', 'application/json');
    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status !== 401) return result;

  const state = api.getState() as RootStateShape;
  const refreshToken = state.auth?.refreshToken;

  if (!refreshToken) {
    api.dispatch(setUnauthenticated());
    return result;
  }

  const refreshKey = '__dms_refresh_in_flight__';
  const anyApi = api as unknown as { [k: string]: any };

  if (!anyApi[refreshKey]) {
    anyApi[refreshKey] = (async () => {
      const refreshResult = await rawBaseQuery(
        {
          url: '/auth/refresh',
          method: 'POST',
          body: { refreshToken },
        },
        api,
        extraOptions,
      );

      if (refreshResult.data) {
        api.dispatch(setTokensFromRefresh(refreshResult.data as any));
        return true;
      }

      api.dispatch(setUnauthenticated());
      return false;
    })().finally(() => {
      anyApi[refreshKey] = null;
    });
  }

  await anyApi[refreshKey];

  result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401) {
    api.dispatch(setUnauthenticated());
  }

  return result;
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  refetchOnMountOrArgChange: true,
  tagTypes: TAG_TYPES,

  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequestBody>({
      query: (body) => ({
        url: '/auth/login',
        method: 'POST',
        body,
      }),
    }),

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

    /**
     * Reception panel (click date → show details)
     */
    getDailyVisitsBreakdown: builder.query<DailyVisitsBreakdownResponse, string>({
      query: (date) => ({
        url: '/reports/daily/visits-breakdown',
        params: { date },
      }),
    }),

    /**
     * ✅ Doctor panel: same "Visitors Ratio" series (N/F/Z + total), but filtered for logged-in doctor
     */
    getDoctorDailyPatientSummarySeries: builder.query<
      DailyPatientSummarySeries,
      { startDate: string; endDate: string }
    >({
      query: ({ startDate, endDate }) => ({
        url: '/reports/daily/doctor/patients/series',
        params: { startDate, endDate },
      }),
    }),

    /**
     * ✅ Doctor panel: daily breakdown (logged-in doctor only)
     */
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

    // ✅ UPDATED TYPE: items include patientName from backend hydration
    getDoctorQueue: builder.query<
      { items: (Visit & { patientName?: string })[] },
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

      async onCacheEntryAdded(arg, { cacheDataLoaded, cacheEntryRemoved, dispatch, getState }) {
        await cacheDataLoaded;

        const state = getState() as RootStateShape;
        const token = state.auth?.accessToken;
        if (!token) {
          await cacheEntryRemoved;
          return;
        }

        const socket = createDoctorQueueWebSocket({
          token,
          onMessage: (data: RealtimeMessage) => {
            if (data.type !== 'DoctorQueueUpdated') return;

            const { doctorId, visitDate } = data.payload;
            if (doctorId !== arg.doctorId) return;
            if (arg.date && arg.date !== visitDate) return;

            dispatch(api.util.invalidateTags([{ type: 'Doctors' as const, id: arg.doctorId }]));
          },
        });

        if (!socket) {
          await cacheEntryRemoved;
          return;
        }

        await cacheEntryRemoved;
        socket.close();
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

    /**
     * (Legacy) If you still use this elsewhere, keep it.
     */
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
  }),
});

export const {
  useLoginMutation,
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
} = api;
