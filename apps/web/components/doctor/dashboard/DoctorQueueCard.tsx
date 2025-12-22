'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Visit } from '@dms/types';
import { useAuth } from '@/src/hooks/useAuth';
import { useGetDoctorQueueQuery, useGetDoctorsQuery } from '@/src/store/api';

type VisitStatus = Visit['status'];
type QueueVisit = Visit & { patientName?: string };

const statusDotClass: Record<VisitStatus, string> = {
  QUEUED: 'bg-pink-400',
  IN_PROGRESS: 'bg-amber-400',
  DONE: 'bg-emerald-500',
};

function getVisitLabel(visit: QueueVisit): string {
  return visit.patientName || visit.reason || `Patient: ${visit.patientId}`;
}

function QueuePill({
  label,
  status,
  muted = false,
}: {
  label: string;
  status?: VisitStatus;
  muted?: boolean;
}) {
  return (
    <div
      className={[
        'flex h-8 items-center justify-between rounded-2xl px-5',
        'shadow-[0_0_0_1px_rgba(0,0,0,0.04)]',
        muted ? 'bg-gray-50 text-gray-400' : 'bg-white text-gray-900',
      ].join(' ')}
    >
      <span className="truncate text-xs">{label}</span>
      {status ? (
        <span
          className={`ml-3 inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass[status]}`}
        />
      ) : (
        <span className="ml-3 inline-block h-3 w-3 shrink-0 rounded-full bg-transparent" />
      )}
    </div>
  );
}

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type DoctorQueueCardProps = {
  onViewAll?: () => void;
};

export default function DoctorQueueCard({ onViewAll }: DoctorQueueCardProps) {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const doctorId = auth.userId;

  const { data: doctors } = useGetDoctorsQuery(undefined, {
    skip: !canUseApi,
  });

  const doctorName = React.useMemo(() => {
    if (!doctorId) return 'Doctor';
    const match = doctors?.find((d) => d.doctorId === doctorId);
    const label = match?.fullName || match?.displayName;
    return label ? label : 'Doctor';
  }, [doctors, doctorId]);

  const todayIso = React.useMemo(() => getTodayIso(), []);

  const { data, isLoading, isFetching, isError } = useGetDoctorQueueQuery(
    { doctorId: doctorId ?? '', date: todayIso },
    { skip: !canUseApi || !doctorId },
  );

  const visits: QueueVisit[] = (data?.items ?? []) as QueueVisit[];

  const doneVisit = React.useMemo(
    () => [...visits].reverse().find((v) => v.status === 'DONE'),
    [visits],
  );
  const inProgressVisit = React.useMemo(
    () => visits.find((v) => v.status === 'IN_PROGRESS'),
    [visits],
  );
  const queuedVisits = React.useMemo(() => visits.filter((v) => v.status === 'QUEUED'), [visits]);

  const showLoading = canUseApi && (isLoading || isFetching);

  const waitingSlots = 5;

  const donePlaceholder = 'No visits done yet.';
  const inProgressPlaceholder = 'No on-going visits.';
  const waitingPlaceholder = 'No waiting visits.';

  return (
    <Card className="w-full rounded-2xl border-none bg-white px-6 py-2 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-gray-900">{doctorName}</h2>
          <p className="text-2xl text-gray-400">Queue</p>
        </div>

        <Button
          type="button"
          variant="ghost"
          onClick={onViewAll}
          className="mt-2 h-8 rounded-full bg-gray-50 px-4 text-xs font-medium text-gray-800 hover:bg-black hover:text-white"
        >
          View all
        </Button>
      </div>

      <div className="space-y-3 pb-2">
        {!canUseApi && (
          <>
            <QueuePill label="Please log in to view queue." muted />
            <QueuePill label="—" muted />
            <QueuePill label="—" muted />
          </>
        )}

        {showLoading && (
          <>
            <QueuePill label="Loading…" muted />
            <QueuePill label="Loading…" muted />
            <QueuePill label="Loading…" muted />
            <QueuePill label="Loading…" muted />
            <QueuePill label="Loading…" muted />
            <QueuePill label="Loading…" muted />
            <QueuePill label="Loading…" muted />
          </>
        )}

        {canUseApi && !showLoading && isError && (
          <>
            <QueuePill label="Couldn’t load queue. Please try again." muted />
            <QueuePill label="—" muted />
          </>
        )}

        {canUseApi && !showLoading && !isError && (
          <>
            {doneVisit ? (
              <QueuePill label={getVisitLabel(doneVisit)} status={doneVisit.status} />
            ) : (
              <QueuePill label={donePlaceholder} muted />
            )}

            {inProgressVisit ? (
              <QueuePill label={getVisitLabel(inProgressVisit)} status={inProgressVisit.status} />
            ) : (
              <QueuePill label={inProgressPlaceholder} muted />
            )}

            {Array.from({ length: waitingSlots }).map((_, i) => {
              const v = queuedVisits[i];
              return v ? (
                <QueuePill key={v.visitId} label={getVisitLabel(v)} status={v.status} />
              ) : (
                <QueuePill key={`waiting-${i}`} label={waitingPlaceholder} muted />
              );
            })}
          </>
        )}
      </div>
    </Card>
  );
}
