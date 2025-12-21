// apps/web/components/doctor/dashboard/DoctorQueueFullPanel.tsx
'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/src/hooks/useAuth';
import { useGetDoctorQueueQuery } from '@/src/store/api';
import type { Visit } from '@dms/types';
import { ArrowLeft } from 'lucide-react';

type QueueVisit = Visit & { patientName?: string };

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const statusLabel: Record<Visit['status'], string> = {
  DONE: 'Completed',
  IN_PROGRESS: 'On-chair',
  QUEUED: 'Waiting',
};

const statusBadgeClass: Record<Visit['status'], string> = {
  DONE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-200',
  QUEUED: 'bg-pink-50 text-pink-700 border-pink-200',
};

function Row({ v }: { v: QueueVisit }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3">
      <div className="min-w-0">
        {/* Patient name */}
        <div className="truncate text-sm font-medium text-gray-900">
          {v.patientName || `Patient: ${v.patientId}`}
        </div>

        {/* Reason */}
        <div className="mt-0.5 truncate text-[11px] text-gray-500">{v.reason ? v.reason : '—'}</div>
      </div>

      <Badge variant="outline" className={`shrink-0 ${statusBadgeClass[v.status]}`}>
        {statusLabel[v.status]}
      </Badge>
    </div>
  );
}

export default function DoctorQueueFullPanel({
  date,
  onBack,
}: {
  date?: string;
  onBack: () => void;
}) {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;
  const doctorId = auth.userId;

  const effectiveDate = date ?? getTodayIso();

  const { data, isLoading, isFetching, isError } = useGetDoctorQueueQuery(
    { doctorId: doctorId ?? '', date: effectiveDate },
    { skip: !canUseApi || !doctorId },
  );

  const visits: QueueVisit[] = (data?.items ?? []) as QueueVisit[];

  const grouped = React.useMemo(() => {
    const queued = visits.filter((v) => v.status === 'QUEUED');
    const inProgress = visits.filter((v) => v.status === 'IN_PROGRESS');
    const done = visits
      .filter((v) => v.status === 'DONE')
      .slice()
      .reverse();
    return { queued, inProgress, done };
  }, [visits]);

  const showLoading = isLoading || isFetching;

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col gap-6 2xl:gap-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Today&apos;s Queue</h2>
            <p className="mt-1 text-sm text-gray-500">
              All visits for {effectiveDate} (Waiting, On-chair, Completed)
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="h-9 rounded-full bg-gray-50 px-4 text-sm font-medium text-gray-800 hover:bg-black hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        {/* Columns */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Waiting */}
          <Card className="flex h-[520px] flex-col rounded-2xl border-none bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3">
              <div className="text-lg font-semibold text-gray-900">Waiting</div>
              <div className="text-sm font-semibold text-gray-500">{grouped.queued.length}</div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {showLoading && <div className="text-sm text-gray-400">Loading…</div>}
              {!showLoading && isError && (
                <div className="text-sm text-red-500">Couldn&apos;t load queue.</div>
              )}
              {!showLoading && !isError && grouped.queued.length === 0 && (
                <div className="text-sm text-gray-400">No waiting visits.</div>
              )}
              {!showLoading && !isError && grouped.queued.map((v) => <Row key={v.visitId} v={v} />)}
            </div>
          </Card>

          {/* On-chair */}
          <Card className="flex h-[520px] flex-col rounded-2xl border-none bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3">
              <div className="text-lg font-semibold text-gray-900">On-chair</div>
              <div className="text-sm font-semibold text-gray-500">{grouped.inProgress.length}</div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {showLoading && <div className="text-sm text-gray-400">Loading…</div>}
              {!showLoading && grouped.inProgress.length === 0 && (
                <div className="text-sm text-gray-400">No on-chair visits.</div>
              )}
              {!showLoading && grouped.inProgress.map((v) => <Row key={v.visitId} v={v} />)}
            </div>
          </Card>

          {/* Completed */}
          <Card className="flex h-[520px] flex-col rounded-2xl border-none bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3">
              <div className="text-lg font-semibold text-gray-900">Completed</div>
              <div className="text-sm font-semibold text-gray-500">{grouped.done.length}</div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {showLoading && <div className="text-sm text-gray-400">Loading…</div>}
              {!showLoading && grouped.done.length === 0 && (
                <div className="text-sm text-gray-400">No completed visits yet.</div>
              )}
              {!showLoading && grouped.done.map((v) => <Row key={v.visitId} v={v} />)}
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
