'use client';

import type { PatientId } from '@dms/types';
import ClinicShell from '@/components/layout/ClinicShell';
import { useRequireAuth } from '@/src/hooks/useAuth';
import { useGetPatientByIdQuery, type ErrorResponse } from '@/src/store/api';

type Params = { params: { id: string } };

type ApiError = {
  status?: number;
  data?: unknown;
};

const asErrorResponse = (data: unknown): ErrorResponse | null => {
  if (!data || typeof data !== 'object') return null;
  const maybe = data as Partial<ErrorResponse>;
  if (typeof maybe.error === 'string') {
    return {
      error: maybe.error,
      message: typeof maybe.message === 'string' ? maybe.message : undefined,
      fieldErrors:
        maybe.fieldErrors && typeof maybe.fieldErrors === 'object'
          ? (maybe.fieldErrors as Record<string, string[]>)
          : undefined,
      traceId: typeof maybe.traceId === 'string' ? maybe.traceId : undefined,
    };
  }
  return null;
};

export default function PatientDetailPage({ params }: Params) {
  // Basic type safety for id
  const patientId = params.id as PatientId;

  const auth = useRequireAuth();
  const authLoading = auth.status === 'checking';

  const {
    data,
    isLoading,
    error: rawError,
  } = useGetPatientByIdQuery(patientId, {
    skip: authLoading,
  });

  const loading = authLoading || isLoading;

  let errorMessage: string | null = null;
  if (rawError) {
    const e = rawError as ApiError;
    const maybe = asErrorResponse(e.data);
    errorMessage = maybe?.message ?? 'Unable to load patient.';
  }

  const title = data?.name ?? (loading ? 'Patient…' : 'Patient');

  return (
    <ClinicShell title={title}>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-white p-4 md:col-span-2">
            <h2 className="text-sm font-medium text-gray-600">Demographics</h2>

            {loading && (
              <div className="mt-2 space-y-2 text-sm text-gray-600" aria-busy="true">
                <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
              </div>
            )}

            {!loading && errorMessage && (
              <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
            )}

            {!loading && !errorMessage && data && (
              <dl className="mt-2 grid gap-2 text-sm text-gray-700">
                <div className="flex gap-2">
                  <dt className="w-24 text-gray-500">Name</dt>
                  <dd>{data.name}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 text-gray-500">Phone</dt>
                  <dd>{data.phone ?? '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 text-gray-500">Gender</dt>
                  <dd>{data.gender ?? '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 text-gray-500">Created</dt>
                  <dd>{new Date(data.createdAt).toLocaleString()}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 text-gray-500">Updated</dt>
                  <dd>{new Date(data.updatedAt).toLocaleString()}</dd>
                </div>
              </dl>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <h2 className="text-sm font-medium text-gray-600">Actions</h2>
            <div className="mt-2 text-sm text-gray-600">
              {/* Future: register visit, see history, etc. */}
              Register visit…
            </div>
          </div>
        </div>
      </section>
    </ClinicShell>
  );
}
