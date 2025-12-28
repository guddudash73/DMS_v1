'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/src/hooks/useAuth';
import { useGetDoctorDailyVisitsBreakdownQuery } from '@/src/store/api';
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
  dotClass: string;
  showDots: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <span className={`h-4 w-4 rounded-full ${dotClass}`} />
        <span className="text-base font-medium text-gray-900">{label}</span>
      </div>
      <span className="text-base font-semibold text-gray-900">{showDots ? '…' : value}</span>
    </div>
  );
}

export default function TodayCaseMixCard() {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const todayIso = getTodayIso();

  const { data, isLoading, isFetching, isError } = useGetDoctorDailyVisitsBreakdownQuery(todayIso, {
    skip: !canUseApi,
  });

  const { n, f, z } = useMemo(() => {
    const items = data?.items ?? [];
    let newCount = 0;
    let followupCount = 0;
    let zeroCount = 0;

    for (const v of items) {
      if (v.tag === 'N') newCount += 1;
      else if (v.tag === 'F') followupCount += 1;
      else if (v.tag === 'Z') zeroCount += 1;
    }

    return { n: newCount, f: followupCount, z: zeroCount };
  }, [data]);

  const showDots = isLoading || isFetching;

  return (
    <Card className="w-full rounded-2xl border-none bg-white px-6 py-4 shadow-sm gap-2">
      <h3 className="text-xl font-semibold tracking-wide text-gray-900">Today&apos;s Case Mix</h3>
      <p className="mt-1 text-xs text-gray-400">Counts are visits (not unique patients).</p>

      <div className="mt-5 space-y-6">
        <Row label="New" value={n} dotClass="bg-[#22c55e]" showDots={showDots} />
        <Row label="Follow-up" value={f} dotClass="bg-[#60a5fa]" showDots={showDots} />
        <Row label="Zero billed" value={z} dotClass="bg-[#cbd5e1]" showDots={showDots} />
      </div>

      {!canUseApi && (
        <p className="mt-4 text-xs text-gray-400">Please log in to view today&apos;s case mix.</p>
      )}
      {isError && <p className="mt-4 text-xs text-red-500">Couldn&apos;t load case mix.</p>}
    </Card>
  );
}
