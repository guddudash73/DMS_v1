'use client';

import * as React from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import VisitorsRatioChart from '@/components/dashboard/VisitorsRatioCharts';
import DailyVisitsBreakdownPanel from '@/components/dashboard/DailyVisitsBreakdownPanel';

import {
  useClinicRealtimeQuery,
  useGetDailyPatientSummaryQuery,
  useGetDailyReportQuery,
} from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';
import { clinicDateISO, formatClinicDatePretty } from '@/src/lib/clinicTime';

function formatPrettyDate(dateIso: string) {
  return formatClinicDatePretty(dateIso);
}

function currencyINR(v?: number) {
  if (typeof v !== 'number') return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);
}

function safeNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function StatCard({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className="rounded-2xl border-none bg-white shadow-sm">
      <div className="p-4 md:p-5">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className={cn('mt-1 text-xl font-semibold tracking-tight', loading && 'opacity-70')}>
          {loading ? '…' : value}
        </div>
        {sub ? <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div> : null}
      </div>
    </Card>
  );
}

function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-base font-semibold tracking-tight">{title}</div>
        {desc ? <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div> : null}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  useClinicRealtimeQuery(undefined, { skip: !canUseApi });

  const [selectedDate, setSelectedDate] = React.useState<string>(() => clinicDateISO(new Date()));
  const [drilldownDate, setDrilldownDate] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDrilldownDate(null);
  }, [selectedDate]);

  const dailyReportQuery = useGetDailyReportQuery(selectedDate, { skip: !canUseApi });
  const patientSummaryQuery = useGetDailyPatientSummaryQuery(selectedDate, { skip: !canUseApi });

  const report = dailyReportQuery.data;
  const summary = patientSummaryQuery.data;

  const reportLoading = dailyReportQuery.isLoading || dailyReportQuery.isFetching;
  const summaryLoading = patientSummaryQuery.isLoading || patientSummaryQuery.isFetching;

  const queued = safeNum(report?.visitCountsByStatus?.QUEUED);
  const onChair = safeNum(report?.visitCountsByStatus?.IN_PROGRESS);
  const done = safeNum(report?.visitCountsByStatus?.DONE);
  const totalVisits = queued + onChair + done;

  const totalRevenue = safeNum(report?.totalRevenue);
  const revenuePerVisit = totalVisits > 0 ? totalRevenue / totalVisits : 0;
  const revenuePerDone = done > 0 ? totalRevenue / done : 0;

  const newPatients = safeNum(summary?.newPatients);
  const followupPatients = safeNum(summary?.followupPatients);
  const zeroBilledVisits = safeNum(summary?.zeroBilledVisits);
  const totalVisitors = safeNum(summary?.totalPatients);

  // ✅ NEW: received totals
  const onlineReceived = safeNum(report?.onlineReceivedTotal);
  const offlineReceived = safeNum(report?.offlineReceivedTotal);
  const receivedTotal = onlineReceived + offlineReceived;

  const procedureRows = React.useMemo(() => {
    const pc = report?.procedureCounts ?? {};
    return Object.entries(pc)
      .map(([name, count]) => ({ name, count: safeNum(count) }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [report?.procedureCounts]);

  const hasErrors = dailyReportQuery.isError || patientSummaryQuery.isError;

  const pageWrapperClass = 'h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10';
  const contentGapClass = 'flex h-full flex-col gap-6 2xl:gap-10';

  if (drilldownDate) {
    return (
      <section className={pageWrapperClass}>
        <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col gap-6 2xl:gap-10">
          <VisitorsRatioChart onDateSelect={(d) => setDrilldownDate(d)} />
          <DailyVisitsBreakdownPanel date={drilldownDate} onBack={() => setDrilldownDate(null)} />
        </div>
      </section>
    );
  }

  return (
    <section className={pageWrapperClass}>
      <div className={contentGapClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Reports</h1>
            <div className="mt-1 text-xs text-muted-foreground">
              Daily clinic metrics: visitors, queue, revenue and procedures.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-2xl border bg-white px-3 py-2 shadow-sm">
              <div className="text-[11px] text-muted-foreground">Report date</div>
              <input
                type="date"
                className="mt-1 h-8 w-40 rounded-xl border bg-white px-2 text-xs"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={!canUseApi}
              />
            </div>
          </div>
        </div>

        {!canUseApi ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">
            Please login to view reports.
          </div>
        ) : hasErrors ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Couldn&apos;t load reports for this date.
          </div>
        ) : null}

        {/* Top stats */}
        <div className="grid grid-cols-1 gap-6 2xl:gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* ✅ REPLACED: Total visits card -> Payments received */}
          <StatCard
            label="Payments received"
            value={<span className="tabular-nums">{currencyINR(receivedTotal)}</span>}
            sub={
              <span>
                Online {currencyINR(onlineReceived)} · Offline {currencyINR(offlineReceived)}
              </span>
            }
            loading={reportLoading}
          />

          <StatCard
            label="Visitors"
            value={totalVisitors}
            sub={
              <span>
                {newPatients} new · {followupPatients} follow-up · {zeroBilledVisits} zero-billed
              </span>
            }
            loading={summaryLoading}
          />

          <StatCard
            label="Total revenue"
            value={currencyINR(totalRevenue)}
            sub={<span>For {formatPrettyDate(selectedDate)}</span>}
            loading={reportLoading}
          />

          <StatCard
            label="Avg. revenue"
            value={currencyINR(revenuePerVisit)}
            sub={<span>Per visit · {currencyINR(revenuePerDone)} per done</span>}
            loading={reportLoading}
          />
        </div>

        {/* Chart + Highlights */}
        <div className="grid grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <VisitorsRatioChart onDateSelect={(d) => setDrilldownDate(d)} />
          </div>

          <Card className="rounded-2xl border-none bg-white shadow-sm">
            <div className="p-4 md:p-5">
              <SectionTitle
                title="Daily highlights"
                desc="Quick view of what happened on this day."
              />

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">Completed visits</div>
                  <div className="mt-0.5 text-base font-semibold">{reportLoading ? '…' : done}</div>
                </div>

                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">Zero billed</div>
                  <div className="mt-0.5 text-base font-semibold">
                    {summaryLoading ? '…' : zeroBilledVisits}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">New patients</div>
                  <div className="mt-0.5 text-base font-semibold">
                    {summaryLoading ? '…' : newPatients}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">Follow-ups</div>
                  <div className="mt-0.5 text-base font-semibold">
                    {summaryLoading ? '…' : followupPatients}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrilldownDate(selectedDate)}
                className="mt-4 w-full rounded-xl border bg-white px-3 py-2 text-xs font-medium shadow-sm hover:bg-slate-50 disabled:opacity-60"
                disabled={!canUseApi}
                title="Open daily breakdown"
              >
                View daily breakdown →
              </button>
            </div>
          </Card>
        </div>

        {/* Procedures */}
        <Card className="rounded-2xl border-none bg-white shadow-sm">
          <div className="p-4 md:p-5">
            <SectionTitle
              title="Procedure & billing lines"
              desc="Counts aggregated from billing line items for this day."
            />

            <div className="mt-4">
              {reportLoading ? (
                <div className="space-y-2">
                  <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
                  <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
                  <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
                </div>
              ) : procedureRows.length === 0 ? (
                <div className="rounded-xl border bg-white px-3 py-3 text-sm text-muted-foreground">
                  No procedure/billing line items found for this day.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border">
                  <div className="grid grid-cols-12 bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-600">
                    <div className="col-span-9">Procedure / Code</div>
                    <div className="col-span-3 text-right">Count</div>
                  </div>

                  <div className="divide-y">
                    {procedureRows.slice(0, 40).map((r) => (
                      <div key={r.name} className="grid grid-cols-12 px-4 py-2 text-sm">
                        <div className="col-span-9 truncate">{r.name}</div>
                        <div className="col-span-3 text-right font-mono tabular-nums">
                          {r.count.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>

                  {procedureRows.length > 40 ? (
                    <div className="border-t bg-white px-4 py-2 text-[11px] text-muted-foreground">
                      Showing top 40. ({procedureRows.length} total)
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
