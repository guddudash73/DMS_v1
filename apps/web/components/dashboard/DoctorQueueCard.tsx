// apps/web/components/dashboard/DoctorQueueCard.tsx
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

const SLOTS_PER_COLUMN = 6;

function labelForColumn(status: VisitStatus): string {
  if (status === 'QUEUED') return 'WAITING';
  if (status === 'IN_PROGRESS') return 'IN_PROCESS';
  return 'DONE';
}

function emptyTextForColumn(status: VisitStatus): string {
  if (status === 'QUEUED') return 'No patients waiting.';
  if (status === 'IN_PROGRESS') return 'No visits in progress.';
  return 'No completed visits yet.';
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

  // ✅ ONE request only
  const queueQ = useGetPatientQueueQuery({ date: todayIso }, { skip: !canUseApi });

  const allItems = (queueQ.data?.items ?? []) as PatientQueueItem[];

  const waiting = React.useMemo(() => allItems.filter((x) => x.status === 'QUEUED'), [allItems]);
  const inProgress = React.useMemo(
    () => allItems.filter((x) => x.status === 'IN_PROGRESS'),
    [allItems],
  );
  const done = React.useMemo(() => allItems.filter((x) => x.status === 'DONE'), [allItems]);

  const cols: Array<{ status: VisitStatus; data: PatientQueueItem[] }> = [
    { status: 'QUEUED', data: waiting },
    { status: 'IN_PROGRESS', data: inProgress },
    { status: 'DONE', data: done },
  ];

  const loading = queueQ.isLoading || queueQ.isFetching;
  const error = !!queueQ.isError;

  const openClinicVisit = (visitId: string) => router.push(`/visits/${visitId}`);

  return (
    <Card className="w-full rounded-2xl border-none bg-white px-4 pb-4 pt-2 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Patient Queue</h2>
      </div>

      {!canUseApi ? (
        <div className="mt-2 rounded-xl bg-gray-50 px-3 py-3 text-[11px] text-gray-400">
          Please log in to view the queue.
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-3">
          {cols.map((c) => {
            const ordered =
              c.status === 'DONE'
                ? [...c.data].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
                : [...c.data].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

            const visible = ordered.slice(0, SLOTS_PER_COLUMN);

            return (
              <div key={c.status}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {labelForColumn(c.status)}
                </div>

                <div className="space-y-2">
                  {error ? (
                    <>
                      <PlaceholderBlock text="Couldn’t load." />
                      {Array.from({ length: SLOTS_PER_COLUMN - 1 }).map((_, i) => (
                        <PlaceholderBlock key={`err-${i}`} text="—" />
                      ))}
                    </>
                  ) : loading ? (
                    Array.from({ length: SLOTS_PER_COLUMN }).map((_, i) => (
                      <PlaceholderBlock key={`load-${i}`} text="Loading…" />
                    ))
                  ) : visible.length === 0 ? (
                    <>
                      <PlaceholderBlock text={emptyTextForColumn(c.status)} />
                      {Array.from({ length: SLOTS_PER_COLUMN - 1 }).map((_, i) => (
                        <PlaceholderBlock key={`empty-${i}`} text="—" />
                      ))}
                    </>
                  ) : (
                    <>
                      {visible.map((v) => (
                        <QueueItemRow
                          key={v.visitId}
                          label={getVisitLabel(v)}
                          status={v.status}
                          onClick={() => openClinicVisit(v.visitId)}
                        />
                      ))}

                      {visible.length < SLOTS_PER_COLUMN
                        ? Array.from({ length: SLOTS_PER_COLUMN - visible.length }).map((_, i) => (
                            <PlaceholderBlock
                              key={`pad-${i}`}
                              text={i === 0 ? emptyTextForColumn(c.status) : '—'}
                            />
                          ))
                        : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
