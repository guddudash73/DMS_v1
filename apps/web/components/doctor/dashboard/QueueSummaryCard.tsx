'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/src/hooks/useAuth';
import { useGetDoctorQueueQuery } from '@/src/store/api';
import type { Visit } from '@dms/types';

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type QueueSummaryCardProps = {
  date?: string;
};

export default function DoctorQueueSummaryCard({ date }: QueueSummaryCardProps) {
  const auth = useAuth();
  const effectiveDate = date ?? getTodayIso();

  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;
  const doctorId = auth.userId;

  const { data, isLoading, isFetching, isError } = useGetDoctorQueueQuery(
    { doctorId: doctorId ?? '', date: effectiveDate },
    { skip: !canUseApi || !doctorId },
  );

  const { completed, onChair, waiting, total } = useMemo(() => {
    const items: Visit[] = data?.items ?? [];

    let done = 0;
    let inProgress = 0;
    let queued = 0;

    for (const v of items) {
      if (v.status === 'DONE') done += 1;
      else if (v.status === 'IN_PROGRESS') inProgress += 1;
      else if (v.status === 'QUEUED') queued += 1;
    }

    return {
      completed: done,
      onChair: inProgress,
      waiting: queued,
      total: done + inProgress + queued,
    };
  }, [data]);

  const showDots = isLoading || isFetching;
  const display = (value: number) => (showDots ? '…' : value);

  return (
    <Card className="w-full rounded-2xl border-none bg-white px-6 py-2 pb-4 shadow-sm md:gap-4 2xl:gap-6">
      <h3 className="text-2xl font-semibold tracking-wide text-gray-300">Queue Summary:</h3>

      <div className="pl-4">
        <div className="space-y-2 text-md">
          <div className="flex items-center gap-6">
            <span className="h-4 w-4 rounded-full bg-[#4ade80]" />
            <span className="text-gray-900">
              Completed: <span className="font-semibold">{display(completed)}</span>
            </span>
          </div>

          <div className="flex items-center gap-6">
            <span className="h-4 w-4 rounded-full bg-[#facc15]" />
            <span className="text-gray-900">
              On-Chair: <span className="font-semibold">{display(onChair)}</span>
            </span>
          </div>

          <div className="flex items-center gap-6">
            <span className="h-4 w-4 rounded-full bg-[#f472b6]" />
            <span className="text-gray-900">
              Waiting: <span className="font-semibold">{display(waiting)}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="h-px w-full bg-gray-200" />

      <div className="flex items-center gap-6 text-md pl-4">
        <span className="h-4 w-4 rounded-full bg-gray-500" />
        <span className="text-gray-900">
          Total: <span className="font-semibold">{display(total)}</span>
        </span>
      </div>

      {!canUseApi && (
        <p className="mt-6 text-sm text-gray-400">Please log in to view your queue summary.</p>
      )}

      {isError && (
        <p className="mt-6 text-sm text-red-500">Couldn&apos;t load your queue summary.</p>
      )}
    </Card>
  );
}
