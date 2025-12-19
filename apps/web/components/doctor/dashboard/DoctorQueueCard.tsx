'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import type { Visit } from '@dms/types';
import { useAuth } from '@/src/hooks/useAuth';
import { useGetDoctorQueueQuery, useGetDoctorsQuery } from '@/src/store/api';

type VisitStatus = Visit['status'];

const statusDotClass: Record<VisitStatus, string> = {
  QUEUED: 'bg-pink-400',
  IN_PROGRESS: 'bg-amber-400',
  DONE: 'bg-emerald-500',
};

function getVisitLabel(visit: Visit): string {
  // You don’t have patientName in Visit yet, so use reason.
  // If reason is empty (shouldn’t be per schema), fallback to patientId.
  return visit.reason || `Patient: ${visit.patientId}`;
}

/** Matches your “pill row” style in the design */
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
        'flex h-8 items-center justify-between rounded-2xl px-5 text-sm',
        'shadow-[0_0_0_1px_rgba(0,0,0,0.04)]',
        muted ? 'bg-gray-50 text-gray-400' : 'bg-white text-gray-900',
      ].join(' ')}
    >
      <span className="truncate">{label}</span>
      {status ? (
        <span
          className={`ml-3 inline-block h-3 w-3 shrink-0 rounded-full ${statusDotClass[status]}`}
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

/**
 * Doctor dashboard queue card:
 * - Single doctor queue (logged-in doctor only)
 * - Uses RTK Query useGetDoctorQueueQuery
 * - Realtime invalidation remains in api.ts (onCacheEntryAdded)
 * - UI slots: 1 DONE, 1 IN_PROGRESS, 5 QUEUED
 */
export default function DoctorQueueCard() {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  // In your types Visit.doctorId is UserId and auth holds userId,
  // so treat auth.userId as doctorId.
  const doctorId = auth.userId;

  // Doctor name dynamic: pull doctors list, match by doctorId
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

  const visits: Visit[] = data?.items ?? [];

  // Bucket the queue like your reception logic
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

  // Fixed slots per your requirement
  // 1 done, 1 in_progress, 5 queued
  const waitingSlots = 5;

  // Placeholders (exact vibe of your 2nd image)
  const donePlaceholder = 'No visits done yet.';
  const inProgressPlaceholder = 'No on-going visits.';
  const waitingPlaceholder = 'No waiting visits.';

  // Render rules:
  // - If loading => show a few muted pills as skeleton-like placeholders
  // - If error => show muted message
  // - Else => show real pills where available, placeholders where missing
  return (
    <Card className="w-full rounded-2xl border-none bg-white px-6 py-2 shadow-sm">
      <div>
        <h2 className="text-3xl font-semibold text-gray-900">{doctorName}</h2>
        <p className="text-2xl text-gray-400">Queue</p>
      </div>

      <div className="space-y-3 pb-2">
        {/* Not authed */}
        {!canUseApi && (
          <>
            <QueuePill label="Please log in to view queue." muted />
            <QueuePill label="—" muted />
            <QueuePill label="—" muted />
          </>
        )}

        {/* Loading */}
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

        {/* Error */}
        {canUseApi && !showLoading && isError && (
          <>
            <QueuePill label="Couldn’t load queue. Please try again." muted />
            <QueuePill label="—" muted />
          </>
        )}

        {/* Normal */}
        {canUseApi && !showLoading && !isError && (
          <>
            {/* DONE slot */}
            {doneVisit ? (
              <QueuePill label={getVisitLabel(doneVisit)} status={doneVisit.status} />
            ) : (
              <QueuePill label={donePlaceholder} muted />
            )}

            {/* IN_PROGRESS slot */}
            {inProgressVisit ? (
              <QueuePill label={getVisitLabel(inProgressVisit)} status={inProgressVisit.status} />
            ) : (
              <QueuePill label={inProgressPlaceholder} muted />
            )}

            {/* QUEUED slots (5) */}
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
