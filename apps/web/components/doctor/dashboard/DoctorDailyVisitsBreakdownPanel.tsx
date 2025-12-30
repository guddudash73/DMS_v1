'use client';

import * as React from 'react';
import { useGetDoctorDailyVisitsBreakdownQuery } from '@/src/store/api';
import { Card } from '@/components/ui/card';
import { formatClinicDatePretty } from '@/src/lib/clinicTime';

function statusBadge(status: string) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset';
  if (status === 'DONE') return `${base} bg-emerald-50 text-emerald-700 ring-emerald-200`;
  if (status === 'IN_PROGRESS') return `${base} bg-amber-50 text-amber-700 ring-amber-200`;
  return `${base} bg-slate-50 text-slate-700 ring-slate-200`;
}

function tagBadge(tag?: string) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset';
  if (tag === 'N') return `${base} bg-teal-50 text-teal-700 ring-teal-200`;
  if (tag === 'F') return `${base} bg-cyan-50 text-cyan-700 ring-cyan-200`;
  if (tag === 'Z') return `${base} bg-zinc-50 text-zinc-700 ring-zinc-200`;
  return `${base} bg-slate-50 text-slate-700 ring-slate-200`;
}

function tagLabel(tag?: string) {
  if (tag === 'N') return 'New';
  if (tag === 'F') return 'Followup';
  if (tag === 'Z') return 'Zero billed';
  return tag ?? '—';
}

function currency(v?: number) {
  if (typeof v !== 'number') return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);
}

type Props = {
  date: string;
  onBack: () => void;
};

export default function DoctorDailyVisitsBreakdownPanel({ date, onBack }: Props) {
  const { data, isLoading, isFetching, isError } = useGetDoctorDailyVisitsBreakdownQuery(date);
  const loading = isLoading || isFetching;

  const totalVisits = loading ? '…' : (data?.totalVisits ?? 0);

  return (
    <Card className="rounded-2xl border-none bg-white shadow-sm">
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Daily breakdown</div>
            <div className="text-lg font-semibold tracking-tight">
              {formatClinicDatePretty(date)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Visits handled by you on this day.
            </div>
          </div>

          <button
            onClick={onBack}
            className="rounded-full border bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-slate-50"
          >
            ← Back
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Doctor</div>
            <div className="mt-0.5 truncate text-base font-semibold">
              {loading ? '…' : (data?.doctorName ?? '—')}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total visits</div>
            <div className="mt-0.5 text-base font-semibold">{totalVisits}</div>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Doctor ID</div>
            <div className="mt-0.5 truncate font-mono text-[12px] text-slate-700">
              {loading || !data?.doctorId
                ? '…'
                : `${data.doctorId.slice(0, 8)}…${data.doctorId.slice(-6)}`}
            </div>
          </div>
        </div>

        <div className="mt-4">
          {isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Couldn&apos;t load daily breakdown for this date.
            </div>
          ) : loading ? (
            <div className="space-y-3">
              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
              <div className="h-28 w-full animate-pulse rounded-xl bg-slate-100" />
              <div className="h-28 w-full animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="rounded-xl border bg-white px-3 py-3 text-sm text-muted-foreground">
              No visits found for this day.
            </div>
          ) : (
            <div className="rounded-2xl border bg-white">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{data.doctorName}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {data.doctorId.slice(0, 8)}…{data.doctorId.slice(-6)}
                  </div>
                </div>

                <div className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {data.totalVisits} visits
                </div>
              </div>

              <div className="max-h-[480px] overflow-y-auto">
                <div className="divide-y">
                  {data.items.map((v) => (
                    <div key={v.visitId} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-sm font-semibold">{v.patientName}</div>
                            <span className={statusBadge(v.status)}>{v.status}</span>
                            <span className={tagBadge(v.tag)}>{tagLabel(v.tag)}</span>
                          </div>

                          {v.reason ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              <span className="font-medium text-slate-700">Reason:</span> {v.reason}
                            </div>
                          ) : null}

                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            {v.patientPhone ? (
                              <span>
                                <span className="text-slate-700">Phone:</span> {v.patientPhone}
                              </span>
                            ) : null}
                            {v.patientGender ? (
                              <span>
                                <span className="text-slate-700">Gender:</span> {v.patientGender}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="text-[11px] text-muted-foreground">Billing</div>
                          <div className="mt-0.5 text-sm font-semibold">
                            {currency(v.billingAmount)}
                          </div>

                          <div className="mt-2 text-[11px] text-muted-foreground">
                            {new Date(v.createdAt).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
