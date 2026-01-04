'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { useAuth } from '@/src/hooks/useAuth';
import { clinicDateISO } from '@/src/lib/clinicTime';
import { useGetPatientQueueQuery } from '@/src/store/api';

import type { PatientQueueItem, Visit } from '@dms/types';

type VisitStatus = Visit['status'];

const statusDotClass: Record<VisitStatus, string> = {
  QUEUED: 'bg-pink-400',
  IN_PROGRESS: 'bg-amber-400',
  DONE: 'bg-emerald-500',
};

function labelForColumn(status: VisitStatus): string {
  if (status === 'QUEUED') return 'WAITING';
  if (status === 'IN_PROGRESS') return 'IN_PROCESS';
  return 'DONE';
}

function getVisitLabel(v: PatientQueueItem): string {
  const name = v.patientName?.trim();
  return name && name.length > 0 ? name : `Patient: ${v.patientId}`;
}

function QueueItemRow({
  label,
  status,
  onClick,
}: {
  label: string;
  status: VisitStatus;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-full cursor-pointer items-center justify-between rounded-xl bg-white px-3 text-left text-xs text-gray-800 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black/10"
      title="Open visit"
    >
      <span className="truncate font-medium">{label}</span>
      <span
        className={`ml-2 inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass[status]}`}
      />
    </button>
  );
}

const PlaceholderBlock = ({ text }: { text: string }) => (
  <div className="flex h-10 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
    {text}
  </div>
);

export default function DoctorQueueCard() {
  const router = useRouter();
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const todayIso = React.useMemo(() => clinicDateISO(new Date()), []);

  // clinic-wide queue, filtered per column
  const waitingQ = useGetPatientQueueQuery(
    { date: todayIso, status: 'QUEUED' },
    { skip: !canUseApi },
  );

  const inProcessQ = useGetPatientQueueQuery(
    { date: todayIso, status: 'IN_PROGRESS' },
    { skip: !canUseApi },
  );

  const doneQ = useGetPatientQueueQuery({ date: todayIso, status: 'DONE' }, { skip: !canUseApi });

  const openClinicVisit = (visitId: string) => {
    router.push(`/visits/${visitId}`);
  };

  const cols: Array<{ status: VisitStatus; data?: PatientQueueItem[]; loading: boolean }> = [
    { status: 'QUEUED', data: waitingQ.data?.items as any, loading: waitingQ.isLoading },
    { status: 'IN_PROGRESS', data: inProcessQ.data?.items as any, loading: inProcessQ.isLoading },
    { status: 'DONE', data: doneQ.data?.items as any, loading: doneQ.isLoading },
  ];

  return (
    <Card className="w-full rounded-2xl border-none bg-white px-4 pb-4 pt-2 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Patient Queue</h2>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {cols.map((c) => {
          const visits = (c.data ?? []) as PatientQueueItem[];
          const loading = c.loading;

          // For DONE, show latest first; others oldest first.
          const ordered =
            c.status === 'DONE'
              ? [...visits].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 4)
              : [...visits].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)).slice(0, 4);

          return (
            <div key={c.status}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {labelForColumn(c.status)}
              </div>

              <div className="space-y-2">
                {loading ? (
                  <PlaceholderBlock text="Loading…" />
                ) : ordered.length === 0 ? (
                  <PlaceholderBlock text="No visits." />
                ) : (
                  ordered.map((v) => (
                    <QueueItemRow
                      key={v.visitId}
                      label={getVisitLabel(v)}
                      status={v.status}
                      onClick={() => openClinicVisit(v.visitId)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
