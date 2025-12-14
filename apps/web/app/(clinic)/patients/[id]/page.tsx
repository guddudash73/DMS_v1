'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';

import type { PatientId, Visit } from '@dms/types';
import {
  useGetPatientByIdQuery,
  useGetPatientVisitsQuery,
  useGetDoctorsQuery,
  type ErrorResponse,
} from '@/src/store/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RegisterVisitDrawer } from '@/components/patients/RegisterVisitDrawer';

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

const formatVisitDate = (dateStr: string) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const rawId = params?.id;

  if (!rawId || typeof rawId !== 'string') {
    return (
      <section className="p-6">
        <p className="text-sm text-red-600">Invalid patient id in URL.</p>
      </section>
    );
  }

  const patientId = rawId as PatientId;

  const {
    data: patient,
    isLoading: patientLoading,
    error: rawPatientError,
  } = useGetPatientByIdQuery(patientId);

  const {
    data: visitsData,
    isLoading: visitsLoading,
    error: rawVisitsError,
  } = useGetPatientVisitsQuery(patientId);

  const { data: doctors } = useGetDoctorsQuery();

  const [selectedDate, setSelectedDate] = React.useState<string>('');

  const loading = patientLoading;

  const patientErrorMessage = React.useMemo(() => {
    if (!rawPatientError) return null;
    const e = rawPatientError as ApiError;
    const maybe = asErrorResponse(e.data);
    return maybe?.message ?? 'Unable to load patient.';
  }, [rawPatientError]);

  const visitsErrorMessage = React.useMemo(() => {
    if (!rawVisitsError) return null;
    const e = rawVisitsError as ApiError;
    const maybe = asErrorResponse(e.data);
    return maybe?.message ?? 'Unable to load visits.';
  }, [rawVisitsError]);

  const visits: Visit[] = visitsData?.items ?? [];

  const filteredVisits = React.useMemo(() => {
    if (!selectedDate) return visits;
    return visits.filter((v) => v.visitDate === selectedDate);
  }, [visits, selectedDate]);

  const doctorNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    doctors?.forEach((d) => {
      map.set(d.doctorId, d.fullName || d.displayName || d.doctorId);
    });
    return map;
  }, [doctors]);

  const followupLabel = 'No Follow Up Scheduled';

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-row justify-end items-center gap-6">
          <div className="text-sm">
            <span className="font-medium text-gray-700">Follow up:&nbsp;</span>
            <span className="font-semibold text-red-500">{followupLabel}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="rounded-2xl border-gray-200 bg-white px-4 text-xs font-medium text-gray-800 hover:bg-gray-100"
          >
            Add Follow up
          </Button>
        </div>

        <Card className="rounded-2xl border-none bg-white px-8 py-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Patient Details:</h2>

          {loading && (
            <div className="space-y-2 text-sm text-gray-600" aria-busy="true">
              <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
            </div>
          )}

          {!loading && patientErrorMessage && (
            <p className="text-sm text-red-600">{patientErrorMessage}</p>
          )}

          {!loading && !patientErrorMessage && patient && (
            <div className="grid gap-4 text-sm text-gray-800 md:grid-cols-2">
              <dl className="space-y-2">
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-gray-600">Name</dt>
                  <dd className="text-gray-900">: {patient.name}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-gray-600">Age/Sex</dt>
                  <dd className="text-gray-900">
                    : {patient.dob ?? '—'} / {patient.gender ?? '—'}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-gray-600">Contact No.</dt>
                  <dd className="text-gray-900">: {patient.phone ?? '—'}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-gray-600">Address</dt>
                  <dd className="whitespace-pre-line text-gray-900">
                    : {/* placeholder until address fields are wired */}
                    {/* Match multi-line style from design if/when data is present */}
                  </dd>
                </div>
              </dl>
              <dl className="space-y-2 md:justify-self-end">
                <div className="flex gap-3">
                  <dt className="w-32 shrink-0 text-gray-600">Regd. Date</dt>
                  <dd className="text-gray-900">
                    :{' '}
                    {patient.createdAt
                      ? new Date(patient.createdAt).toLocaleDateString('en-GB')
                      : '—'}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-32 shrink-0 text-gray-600">SD-ID</dt>
                  <dd className="text-gray-900">: {patient.patientId}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-32 shrink-0 text-gray-600">OPD No.</dt>
                  <dd className="text-gray-900">: —</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-32 shrink-0 text-gray-600">Last Visit</dt>
                  <dd className="text-gray-900">: —</dd>
                </div>
              </dl>
            </div>
          )}

          <div className="mt-5">
            <RegisterVisitDrawer patientId={patientId} />
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4 pt-10">
        <div className="flex items-center justify-end gap-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">
              <span className="text-gray-500">Pick a date</span>
              <input
                type="date"
                className="h-7 rounded-full border border-gray-200 bg-gray-50 px-2 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-black"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div>
          <Card className="rounded-2xl border-none bg-white px-0 py-0 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-6 py-3">Visit Date</th>
                    <th className="px-6 py-3">Reason</th>
                    <th className="px-6 py-3">Diagnosis By.</th>
                    <th className="px-6 py-3">X-Ray</th>
                    <th className="px-6 py-3">Prescription</th>
                    <th className="px-6 py-3">Bill</th>
                  </tr>
                </thead>
                <tbody>
                  {visitsLoading && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-6 text-center text-sm text-gray-500"
                        aria-busy="true"
                      >
                        Loading visits…
                      </td>
                    </tr>
                  )}

                  {!visitsLoading && visitsErrorMessage && (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-center text-sm text-red-600">
                        {visitsErrorMessage}
                      </td>
                    </tr>
                  )}

                  {!visitsLoading &&
                    !visitsErrorMessage &&
                    filteredVisits.map((visit) => {
                      const doctorName =
                        doctorNameById.get(visit.doctorId) ?? visit.doctorId ?? '—';

                      return (
                        <tr key={visit.visitId} className="border-b last:border-b-0">
                          <td className="px-6 py-4 text-sm text-gray-800">
                            {formatVisitDate(visit.visitDate)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-800">{visit.reason || '—'}</td>
                          <td className="px-6 py-4 text-sm text-gray-800">{doctorName}</td>
                          <td className="px-6 py-4">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full border-gray-200 bg-white px-5 text-xs text-gray-800 hover:bg-gray-100"
                            >
                              View
                            </Button>
                          </td>
                          <td className="px-6 py-4">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full border-gray-200 bg-white px-5 text-xs text-gray-800 hover:bg-gray-100"
                            >
                              View
                            </Button>
                          </td>
                          <td className="px-6 py-4">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full border-gray-200 bg-white px-5 text-xs text-gray-800 hover:bg-gray-100"
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      );
                    })}

                  {!visitsLoading && !visitsErrorMessage && filteredVisits.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-center text-sm text-gray-500">
                        No visits found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="flex justify-end gap-3 py-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="rounded-2xl bg-white px-6 text-xs text-gray-800 hover:bg-gray-100 cursor-pointer"
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="rounded-2xl bg-black text-xs text-white hover:bg-black/70 hover:text-white cursor-pointer"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
