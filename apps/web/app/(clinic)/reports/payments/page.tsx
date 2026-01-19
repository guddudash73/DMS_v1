'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useAuth } from '@/src/hooks/useAuth';
import { useClinicRealtimeQuery, useGetDailyPaymentsBreakdownQuery } from '@/src/store/api';
import {
  clinicDateISO,
  formatClinicDatePretty,
  formatClinicTimeFromMs,
} from '@/src/lib/clinicTime';

function currencyINR(v?: number) {
  if (typeof v !== 'number') return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);
}

function safeNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function modeBadge(mode: 'ONLINE' | 'OFFLINE' | 'OTHER') {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset';
  if (mode === 'ONLINE') return `${base} bg-emerald-50 text-emerald-700 ring-emerald-200`;
  if (mode === 'OFFLINE') return `${base} bg-amber-50 text-amber-700 ring-amber-200`;
  return `${base} bg-slate-50 text-slate-700 ring-slate-200`;
}

function StatMini({
  label,
  value,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-5 py-4">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tracking-tight', loading && 'opacity-70')}>
        {loading ? '…' : value}
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  const router = useRouter();
  const params = useSearchParams();

  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  useClinicRealtimeQuery(undefined, { skip: !canUseApi });

  const date = React.useMemo(() => {
    const q = params.get('date')?.trim();
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    return clinicDateISO(new Date());
  }, [params]);

  const q = useGetDailyPaymentsBreakdownQuery(date, { skip: !canUseApi });

  const loading = q.isLoading || q.isFetching;
  const totals = q.data?.totals;

  const total = safeNum(totals?.total);
  const online = safeNum(totals?.online);
  const offline = safeNum(totals?.offline);
  const other = safeNum(totals?.other);

  const items = React.useMemo(() => {
    const list = (q.data?.items ?? []).slice();
    list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return list;
  }, [q.data?.items]);

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="mx-auto flex h-full w-full max-w-300 flex-col gap-6 2xl:gap-10">
        <Card className="rounded-2xl border-none bg-white shadow-sm">
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Payments received</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">
                  {formatClinicDatePretty(date)}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  All checked-out visits with payment mode (Online / Offline / Other).
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="rounded-full px-4"
                onClick={() => router.back()}
              >
                ← Back
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatMini label="Total" value={currencyINR(total)} loading={loading} />
              <StatMini label="Online" value={currencyINR(online)} loading={loading} />
              <StatMini label="Offline" value={currencyINR(offline)} loading={loading} />
              <StatMini label="Other" value={currencyINR(other)} loading={loading} />
            </div>

            <div className="mt-6">
              {q.isError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Couldn&apos;t load payments for this date.
                </div>
              ) : loading ? (
                <div className="space-y-3">
                  <div className="h-16 w-full animate-pulse rounded-2xl bg-slate-100" />
                  <div className="h-16 w-full animate-pulse rounded-2xl bg-slate-100" />
                  <div className="h-16 w-full animate-pulse rounded-2xl bg-slate-100" />
                </div>
              ) : items.length === 0 ? (
                <div className="rounded-2xl border bg-white px-4 py-4 text-sm text-muted-foreground">
                  No checked-out payments found for this day.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border bg-white">
                  <div className="grid grid-cols-12 bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-600">
                    <div className="col-span-5">Patient</div>
                    <div className="col-span-4">Reason</div>
                    <div className="col-span-2">Mode</div>
                    <div className="col-span-1 text-right">Amount</div>
                  </div>

                  <div className="divide-y">
                    {items.map((x) => (
                      <div key={x.visitId} className="grid grid-cols-12 px-4 py-3">
                        <div className="col-span-5 min-w-0">
                          <div className="truncate text-sm font-semibold">{x.patientName}</div>

                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            {x.patientPhone ? (
                              <span>
                                <span className="text-slate-700">Phone:</span> {x.patientPhone}
                              </span>
                            ) : null}
                            {x.patientGender ? (
                              <span>
                                <span className="text-slate-700">Gender:</span> {x.patientGender}
                              </span>
                            ) : null}
                            <span>
                              <span className="text-slate-700">Time:</span>{' '}
                              {typeof x.createdAt === 'number'
                                ? formatClinicTimeFromMs(x.createdAt)
                                : '—'}
                            </span>
                          </div>
                        </div>

                        <div className="col-span-4 min-w-0">
                          <div className="truncate text-sm text-slate-700">{x.reason ?? '—'}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            Visit: <span className="font-mono">{x.visitId.slice(0, 8)}…</span>
                          </div>
                        </div>

                        <div className="col-span-2 flex items-start">
                          <span className={modeBadge(x.paymentMode)}>{x.paymentMode}</span>
                        </div>

                        <div className="col-span-1 text-right">
                          <div className="text-sm font-semibold tabular-nums">
                            {currencyINR(x.billingAmount)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
