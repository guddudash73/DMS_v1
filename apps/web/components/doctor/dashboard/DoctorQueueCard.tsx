'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Visit } from '@dms/types';
import { useAuth } from '@/src/hooks/useAuth';
import { useGetDoctorQueueQuery, useGetMeQuery } from '@/src/store/api';
import { clinicDateISO } from '@/src/lib/clinicTime';

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

function getTodayIso(): string {
  return clinicDateISO(new Date());
}

function toDoctorFirstNameLabel(rawName: string | undefined | null): string {
  const name = (rawName ?? '').trim();
  if (!name) return 'Doctor';
  const first = name.split(/\s+/)[0];
  return first ? `Dr. ${first}` : 'Doctor';
}

// ✅ Choose font size based on length so it won't wrap
function getDoctorNameTextClass(label: string): string {
  const len = label.trim().length;

  // Keep your original as default: text-3xl
  // Scale down progressively for long names.
  if (len <= 10) return 'text-3xl';
  if (len <= 14) return 'text-2xl';
  if (len <= 18) return 'text-xl';
  if (len <= 24) return 'text-lg';
  return 'text-base';
}

function QueuePill({
  label,
  status,
  muted = false,
  onClick,
}: {
  label: string;
  status?: VisitStatus;
  muted?: boolean;
  onClick?: () => void;
}) {
  const base =
    'flex h-8 w-full items-center justify-between rounded-2xl px-5 ' +
    'shadow-[0_0_0_1px_rgba(0,0,0,0.04)] ' +
    (muted ? 'bg-gray-50 text-gray-400' : 'bg-white text-gray-900');

  if (onClick && !muted) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={[
          base,
          'cursor-pointer text-left',
          'transition hover:shadow-[0_0_0_1px_rgba(0,0,0,0.08)] hover:bg-gray-50',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20',
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
      </button>
    );
  }

  return (
    <div className={base}>
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

type DoctorQueueCardProps = {
  onViewAll?: () => void;
};

export default function DoctorQueueCard({ onViewAll }: DoctorQueueCardProps) {
  const router = useRouter();
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;
  const doctorId = auth.userId;

  const { data: me } = useGetMeQuery(undefined, { skip: !canUseApi });

  const doctorName = React.useMemo(() => {
    const fullName = me?.doctorProfile?.fullName;
    const fallback = me?.displayName;
    return toDoctorFirstNameLabel(fullName || fallback || 'Doctor');
  }, [me]);

  const doctorNameTextClass = React.useMemo(() => getDoctorNameTextClass(doctorName), [doctorName]);

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

  const goToVisit = React.useCallback(
    (visitId: string | undefined) => {
      if (!visitId) return;
      router.push(`/doctor/visits/${visitId}`);
    },
    [router],
  );

  return (
    <Card className="w-full rounded-2xl border-none bg-white px-6 py-2 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className={[
              doctorNameTextClass,
              'font-semibold text-gray-900',
              'whitespace-nowrap truncate', // ✅ prevent wrapping, keep one line
              'max-w-[16rem] sm:max-w-[20rem] md:max-w-[24rem]', // ✅ keeps layout stable
            ].join(' ')}
            title={doctorName}
          >
            {doctorName}
          </h2>
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
              <QueuePill
                label={getVisitLabel(doneVisit)}
                status={doneVisit.status}
                onClick={() => goToVisit(doneVisit.visitId)}
              />
            ) : (
              <QueuePill label={donePlaceholder} muted />
            )}

            {inProgressVisit ? (
              <QueuePill
                label={getVisitLabel(inProgressVisit)}
                status={inProgressVisit.status}
                onClick={() => goToVisit(inProgressVisit.visitId)}
              />
            ) : (
              <QueuePill label={inProgressPlaceholder} muted />
            )}

            {Array.from({ length: waitingSlots }).map((_, i) => {
              const v = queuedVisits[i];
              return v ? (
                <QueuePill
                  key={v.visitId}
                  label={getVisitLabel(v)}
                  status={v.status}
                  onClick={() => goToVisit(v.visitId)}
                />
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
