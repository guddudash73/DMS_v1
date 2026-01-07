// apps/web/components/dashboard/TodayCaseMixCard.tsx
'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/src/hooks/useAuth';
import { useGetDailyVisitsBreakdownQuery } from '@/src/store/api';
import { clinicDateISO } from '@/src/lib/clinicTime';

function getTodayIso(): string {
  return clinicDateISO(new Date());
}

function Row({
  label,
  value,
  dotClass,
  showDots,
}: {
  label: string;
  value: number;
  dotClass?: string;
  showDots: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {dotClass ? <span className={`h-3 w-3 rounded-lg ${dotClass}`} /> : null}
        <span className="truncate text-sm font-medium text-gray-900">{label}</span>
      </div>

      <span className="shrink-0 text-sm font-semibold text-gray-900 tabular-nums">
        {showDots ? '…' : value}
      </span>
    </div>
  );
}

type ClinicDailyVisitsBreakdownItem = {
  visitId: string;
  visitDate: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'DONE';

  // ✅ tags are only N/F now
  tag?: 'N' | 'F';

  // ✅ zero-billed flag
  zeroBilled?: boolean;

  reason?: string;
  billingAmount?: number;
  createdAt: number;
  updatedAt: number;

  patientId: string;
  patientName: string;
  patientPhone?: string;
  patientGender?: string;
};

type ClinicDailyVisitsBreakdownResponse = {
  date: string;
  totalVisits: number;
  items: ClinicDailyVisitsBreakdownItem[];
};

export default function TodayCaseMixCard() {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const todayIso = getTodayIso();

  const { data, isLoading, isFetching, isError } = useGetDailyVisitsBreakdownQuery(todayIso, {
    skip: !canUseApi,
  }) as {
    data?: ClinicDailyVisitsBreakdownResponse;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
  };

  const showDots = isLoading || isFetching;

  const stats = useMemo(() => {
    const items: ClinicDailyVisitsBreakdownItem[] = data?.items ?? [];

    let newCount = 0;
    let followupCount = 0;

    // billing split is independent of N/F count
    let zeroBilledCount = 0;
    let billedCount = 0;

    for (const v of items) {
      if (v.tag === 'N') newCount += 1;
      else if (v.tag === 'F') followupCount += 1;

      if (v.zeroBilled === true) {
        zeroBilledCount += 1;
      } else {
        // Count as "Billed" only if it has a positive billing amount.
        const amt = typeof v.billingAmount === 'number' ? v.billingAmount : 0;
        if (amt > 0) billedCount += 1;
      }
    }

    const visitorsTotal = newCount + followupCount;

    // Safety clamp (should never go negative)
    billedCount = Math.max(0, billedCount);

    return {
      n: newCount,
      f: followupCount,
      visitorsTotal,
      billed: billedCount,
      zeroBilled: zeroBilledCount,
    };
  }, [data?.items]);

  return (
    <Card className="w-full rounded-2xl border-none bg-white px-6 py-4 shadow-sm h-full flex justify-center">
      <h3 className="text-xl font-semibold tracking-wide text-gray-900">Today&apos;s Case Mix</h3>
      <p className="mt-1 text-xs text-gray-400">Counts are visits (not unique patients).</p>

      {/* Keep the overall height/feel similar, but show the richer breakdown */}
      <div className="mt-4 space-y-2.5">
        <Row label="New (N)" value={stats.n} dotClass="bg-[#22c55e]" showDots={showDots} />
        <Row label="Followup (F)" value={stats.f} dotClass="bg-[#60a5fa]" showDots={showDots} />

        <div className="my-2 h-px w-full bg-gray-900/10" />

        <Row label="Visitors total (N+F)" value={stats.visitorsTotal} showDots={showDots} />
        <Row label="Billed" value={stats.billed} showDots={showDots} />
        <Row label="Zero billed (Z)" value={stats.zeroBilled} showDots={showDots} />
      </div>

      {!canUseApi ? (
        <p className="mt-3 text-xs text-gray-400">Please log in to view today&apos;s case mix.</p>
      ) : null}

      {isError ? <p className="mt-3 text-xs text-red-500">Couldn&apos;t load case mix.</p> : null}
    </Card>
  );
}
