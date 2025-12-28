'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { useGetDailyReportQuery } from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';
import { clinicDateISO } from '@/src/lib/clinicTime';

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

  const {
    data: report,
    isLoading,
    isFetching,
    isError,
  } = useGetDailyReportQuery(effectiveDate, {
    skip: !canUseApi,
  });

  const { completed, onChair, waiting, total } = useMemo(() => {
    if (!report) {
      return { completed: 0, onChair: 0, waiting: 0, total: 0 };
    }

    const queued = report.visitCountsByStatus.QUEUED ?? 0;
    const inProgress = report.visitCountsByStatus.IN_PROGRESS ?? 0;
    const done = report.visitCountsByStatus.DONE ?? 0;

    return {
      completed: done,
      onChair: inProgress,
      waiting: queued,
      total: queued + inProgress + done,
    };
  }, [report]);

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
