'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { useGetPatientsQuery, type ErrorResponse } from '@/src/store/api';

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

export default function PatientsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQuery(searchInput.trim() || undefined);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const {
    data,
    isLoading,
    isFetching,
    error: rawError,
  } = useGetPatientsQuery({ query, limit: 20 });

  const loading = isLoading;
  let errorMessage: string | null = null;

  if (rawError) {
    const e = rawError as ApiError;
    const maybe = asErrorResponse(e.data);
    errorMessage = maybe?.message ?? 'Unable to load patients.';
  }

  return (
    <section className="space-y-4 p-4 md:p-6 2xl:p-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Patients</h1>
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Search by name, phone..."
            className="w-64 rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </header>

      {loading && (
        <div className="rounded-2xl border bg-white p-4" aria-busy="true">
          <p className="text-sm text-gray-600">Loading patients…</p>
        </div>
      )}

      {!loading && errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && (
        <div className="rounded-2xl border bg-white p-0">
          {data && data.items.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Gender</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((patient) => (
                  <tr key={patient.patientId} className="border-b last:border-b-0">
                    <td className="px-4 py-2">{patient.name}</td>
                    <td className="px-4 py-2">{patient.phone ?? '—'}</td>
                    <td className="px-4 py-2">{patient.gender ?? '—'}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/patients/${patient.patientId}`}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-4 text-sm text-gray-600">
              {query ? 'No patients match your search.' : 'No patients yet.'}
            </p>
          )}
        </div>
      )}

      {isFetching && !loading && (
        <p className="text-xs text-gray-500" aria-live="polite">
          Updating…
        </p>
      )}
    </section>
  );
}
