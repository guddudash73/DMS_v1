'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { useGetDailyVisitsBreakdownQuery } from '@/src/store/api';
import { formatClinicDatePretty, formatClinicTimeFromMs } from '@/src/lib/clinicTime';

function statusBadge(status: string) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset';
  if (status === 'DONE') return `${base} bg-emerald-50 text-emerald-700 ring-emerald-200`;
  if (status === 'IN_PROGRESS') return `${base} bg-amber-50 text-amber-700 ring-amber-200`;
  return `${base} bg-slate-50 text-slate-700 ring-slate-200`;
}

function tagBadgeClass(tag: 'N' | 'F') {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset';
  if (tag === 'N') return `${base} bg-teal-50 text-teal-700 ring-teal-200`;
  return `${base} bg-cyan-50 text-cyan-700 ring-cyan-200`;
}

function tagText(tag: 'N' | 'F') {
  return tag === 'N' ? 'New (N)' : 'Followup (F)';
}

function zeroBilledBadgeClass() {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset';
  return `${base} bg-zinc-50 text-zinc-700 ring-zinc-200`;
}

function currency(v?: number) {
  if (typeof v !== 'number') return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);
}

type BreakdownItem = {
  visitId: string;
  visitDate?: string;
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
};

type BreakdownResponse = {
  date: string;
  totalVisits: number;
  items: BreakdownItem[];
};

type Props = {
  date: string;
  onBack: () => void;
  title?: string;
  subtitle?: string;
};

export default function DailyVisitsBreakdownPanel({
  date,
  onBack,
  title = 'Daily breakdown',
  subtitle = 'Clinic-wide visits for this day.',
}: Props) {
  const { data, isLoading, isFetching, isError } = useGetDailyVisitsBreakdownQuery(date) as {
    data?: BreakdownResponse;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
  };

  const loading = isLoading || isFetching;

  const items = React.useMemo<BreakdownItem[]>(() => {
    const list = (data?.items ?? []).slice();
    list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return list;
  }, [data?.items]);

  const totalVisits = loading ? '…' : (data?.totalVisits ?? items.length);

  return (
    <Card className="rounded-2xl border-none bg-white shadow-sm">
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{title}</div>
            <div className="text-lg font-semibold tracking-tight">
              {formatClinicDatePretty(date)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
          </div>

          <button
            onClick={onBack}
            className="rounded-full border bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-slate-50 cursor-pointer"
          >
            ← Back
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Scope</div>
            <div className="mt-0.5 truncate text-base font-semibold">Clinic</div>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total visits</div>
            <div className="mt-0.5 text-base font-semibold">{totalVisits}</div>
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
          ) : items.length === 0 ? (
            <div className="rounded-xl border bg-white px-3 py-3 text-sm text-muted-foreground">
              No visits found for this day.
            </div>
          ) : (
            <div className="rounded-2xl border bg-white">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">Clinic</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {formatClinicDatePretty(date)}
                  </div>
                </div>

                <div className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {items.length} visits
                </div>
              </div>

              <div className="max-h-120 overflow-y-auto">
                <div className="divide-y">
                  {items.map((v) => (
                    <div key={v.visitId} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-sm font-semibold">{v.patientName}</div>

                            <span className={statusBadge(v.status)}>{v.status}</span>
                            {v.tag ? (
                              <span className={tagBadgeClass(v.tag)}>{tagText(v.tag)}</span>
                            ) : null}

                            {v.zeroBilled ? (
                              <span className={zeroBilledBadgeClass()}>Zero billed (Z)</span>
                            ) : null}
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            <span className="font-medium text-slate-700">Reason:</span>{' '}
                            {v.reason ?? '—'}
                          </div>

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
                            {typeof v.createdAt === 'number'
                              ? formatClinicTimeFromMs(v.createdAt)
                              : '—'}
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
