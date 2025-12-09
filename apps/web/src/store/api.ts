// apps/web/src/store/api.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
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
} from '@dms/types';

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

type AuthStateShape = {
  auth?: {
    accessToken?: string;
  };
};

export const api = createApi({
  reducerPath: 'api',
  refetchOnFocus: true,
  refetchOnReconnect: true,
  refetchOnMountOrArgChange: true,
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
      const state = getState() as AuthStateShape;
      const token = state.auth?.accessToken;
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }
      headers.set('accept', 'application/json');
      return headers;
    },
  }),
  tagTypes: ['Patients', 'Patient', 'Doctors', 'UserPreferences'],
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequestBody>({
      query: (body) => ({
        url: '/auth/login',
        method: 'POST',
        body,
      }),
    }),

    // Needs date per backend contract: /reports/daily?date=YYYY-MM-DD
    getDailyReport: builder.query<DailyReport, string>({
      query: (date) => ({
        url: '/reports/daily',
        params: { date },
      }),
    }),

    // /reports/daily/patients?date=YYYY-MM-DD
    getDailyPatientSummary: builder.query<DailyPatientSummary, string>({
      query: (date) => ({
        url: '/reports/daily/patients',
        params: { date },
      }),
    }),

    // NEW: /reports/daily/patients/series?startDate=...&endDate=...
    getDailyPatientSummarySeries: builder.query<
      DailyPatientSummarySeries,
      { startDate: string; endDate: string }
    >({
      query: ({ startDate, endDate }) => ({
        url: '/reports/daily/patients/series',
        params: { startDate, endDate },
      }),
    }),

    getDoctors: builder.query<AdminDoctorListItem[], void>({
      query: () => ({
        url: '/admin/doctors',
      }),
      providesTags: ['Doctors'],
    }),

    // per-user preferences (where we store selected doctorIds)
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
      invalidatesTags: [{ type: 'Patients', id: 'LIST' }],
    }),

    getPatientById: builder.query<Patient, string>({
      query: (patientId) => ({
        url: `/patients/${patientId}`,
      }),
      providesTags: (_result, _error, id) => [{ type: 'Patient', id }],
    }),

    getDoctorQueue: builder.query<
      { items: Visit[] },
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
    }),
  }),
});

export const {
  useLoginMutation,
  useGetPatientsQuery,
  useCreatePatientMutation,
  useGetPatientByIdQuery,
  useGetDailyReportQuery,
  useGetDailyPatientSummaryQuery,
  useGetDailyPatientSummarySeriesQuery,
  useGetDoctorsQuery,
  useGetMyPreferencesQuery,
  useUpdateMyPreferencesMutation,
  useGetDoctorQueueQuery,
} = api;
