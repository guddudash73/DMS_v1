// apps/web/components/dashboard/QueueSummaryCard.tsx
'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/src/hooks/useAuth';
import { clinicDateISO } from '@/src/lib/clinicTime';
import { useGetPatientQueueQuery } from '@/src/store/api';

import type { PatientQueueItem } from '@dcm/types';

function getTodayIso(): string {
  return clinicDateISO(new Date());
}

type QueueSummaryCardProps = {
  date?: string;
};

export default function QueueSummaryCard({ date }: QueueSummaryCardProps) {
  const auth = useAuth();
  const effectiveDate = date ?? getTodayIso();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  // ✅ same cache as DoctorQueueCard (and dashboard patients list, if you switch it too)
  const { data, isLoading, isFetching, isError } = useGetPatientQueueQuery(
    { date: effectiveDate },
    { skip: !canUseApi },
  );

  const items = (data?.items ?? []) as PatientQueueItem[];

  const { completed, onChair, waiting, total } = React.useMemo(() => {
    let queued = 0;
    let inProgress = 0;
    let done = 0;

    for (const v of items) {
      if (v.status === 'QUEUED') queued += 1;
      else if (v.status === 'IN_PROGRESS') inProgress += 1;
      else if (v.status === 'DONE') done += 1;
    }

    return {
      completed: done,
      onChair: inProgress,
      waiting: queued,
      total: queued + inProgress + done,
    };
  }, [items]);

  const showDots = isLoading || isFetching;
  const display = (value: number) => (showDots ? '…' : value);

  return (
    <Card className="flex h-full flex-col rounded-2xl border border-none bg-white px-6 py-2 shadow-sm gap-2 2xl:justify-center">
      <h3 className="text-lg font-semibold tracking-wide text-gray-400">Queue Summary:</h3>

      <div className="mt-4 space-y-3 text-base">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full bg-[#4ade80]" />
          <span className="text-gray-900">
            Completed: <span className="font-semibold">{display(completed)}</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full bg-[#facc15]" />
          <span className="text-gray-900">
            On-Chair: <span className="font-semibold">{display(onChair)}</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full bg-[#f472b6]" />
          <span className="text-gray-900">
            Waiting: <span className="font-semibold">{display(waiting)}</span>
          </span>
        </div>
      </div>

      <div className="my-4 h-px w-full bg-gray-200" />

      <div className="flex items-center gap-3 text-base">
        <span className="h-4 w-4 rounded-full bg-gray-500" />
        <span className="text-gray-900">
          Total: <span className="font-semibold">{display(total)}</span>
        </span>
      </div>

      {isError && (
        <p className="mt-1 text-xs text-red-500">Couldn&apos;t load today&apos;s queue summary.</p>
      )}
    </Card>
  );
}
