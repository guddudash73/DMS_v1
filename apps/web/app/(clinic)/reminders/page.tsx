'use client';

import * as React from 'react';
import ClinicShell from '@/components/layout/ClinicShell';
import { useRequireAuth } from '@/src/hooks/useAuth';
import { useGetDailyFollowupsQuery } from '@/src/store/api';
import Link from 'next/link';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RemindersPage() {
  const auth = useRequireAuth();
  const authLoading = auth.status === 'checking';

  const [date, setDate] = React.useState<string>(() => todayIso());

  const { data, isLoading, isFetching, error } = useGetDailyFollowupsQuery(date, {
    skip: authLoading,
  });

  const loading = authLoading || isLoading || isFetching;

  let errorMessage: string | null = null;
  if (error && typeof error === 'object' && 'data' in error) {
    const maybe = (error as { data?: unknown }).data;
    if (
      maybe &&
      typeof maybe === 'object' &&
      'message' in maybe &&
      typeof (maybe as any).message === 'string'
    ) {
      errorMessage = (maybe as any).message;
    } else {
      errorMessage = 'Unable to load follow-ups.';
    }
  }

  const items = data?.items ?? [];

  return (
    <ClinicShell>
      <div className="p-4 md:p-6 2xl:p-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-gray-900">Follow-ups for the day</h2>
            <p className="text-xs text-gray-600">
              Call back patients with active follow-ups and record outcomes.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="followup-date" className="text-gray-600">
              Date
            </label>
            <input
              id="followup-date"
              type="date"
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-black"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        {loading && (
          <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">
            Loading follow-ups…
          </div>
        )}

        {!loading && errorMessage && (
          <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{errorMessage}</div>
        )}

        {!loading && !errorMessage && items.length === 0 && (
          <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">
            No active follow-ups scheduled for this date.
          </div>
        )}

        {!loading && !errorMessage && items.length > 0 && (
          <div className="rounded-2xl border bg-white p-0">
            <div className="overflow-x-auto rounded-2xl">
              <table className="min-w-full text-xs text-gray-800">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Patient</th>
                    <th className="px-3 py-2 text-left font-semibold">Phone</th>
                    <th className="px-3 py-2 text-left font-semibold">Reason</th>
                    <th className="px-3 py-2 text-left font-semibold">Contact</th>
                    <th className="px-3 py-2 text-left font-semibold">Visit</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((f) => (
                    <tr key={f.visitId} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <div className="font-medium">{f.patientName}</div>
                        <div className="text-[10px] text-gray-500">{f.patientId}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {f.patientPhone ?? <span className="text-gray-400">No phone</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {f.reason ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs capitalize">
                        {f.contactMethod.toLowerCase()}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <Link
                          href={`/visits/${f.visitId}`}
                          className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] text-gray-700 hover:bg-gray-50"
                        >
                          Open visit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ClinicShell>
  );
}
