'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';

import { Card } from '@/components/ui/card';
import { useAuth } from '@/src/hooks/useAuth';
import { clinicDateISO } from '@/src/lib/clinicTime';
import { api, useGetPatientQueueQuery } from '@/src/store/api';

import type { PatientQueueItem, Visit } from '@dcm/types';

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getIsOffline(v: PatientQueueItem): boolean {
  return isRecord(v) && v['isOffline'] === true;
}

function getDailyPatientNumber(v: PatientQueueItem): number | null {
  if (!isRecord(v)) return null;
  const raw = v['dailyPatientNumber'];
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? raw : null;
}

function getPatientIdFromQueueItem(v: PatientQueueItem): string | null {
  // some payloads may include patientId directly; keep safe
  const pid = (v as any)?.patientId ?? v.patientId;
  return typeof pid === 'string' && pid.trim() ? pid.trim() : null;
}

function OfflineBadge() {
  return (
    <span
      className="ml-1.5 inline-flex items-center rounded border border-gray-200 bg-gray-100 px-1.5 py-px text-[9px] font-medium leading-none text-gray-600"
      title="Offline visit"
    >
      OFF
    </span>
  );
}

function QueueItemRow({
  label,
  status,
  onClick,
  onPrefetch,
  isOffline,
  dailyPatientNumber,
}: {
  label: string;
  status: VisitStatus;
  onClick: () => void;
  onPrefetch?: () => void;
  isOffline?: boolean;
  dailyPatientNumber?: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onPrefetch} // desktop hover
      onPointerDown={onPrefetch} // mobile "touchstart-like"
      className="flex h-10 w-full cursor-pointer items-center justify-between rounded-xl bg-white px-3 text-left text-xs text-gray-800 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black/10"
      title="Open visit"
    >
      <span className="min-w-0 truncate font-medium">
        <span className="mr-2 inline-flex h-6 min-w-11 items-center justify-center rounded-lg border bg-gray-50 px-2 text-[11px] font-semibold text-gray-700">
          {dailyPatientNumber ? `#${dailyPatientNumber}` : '—'}
        </span>

        {label}
        {isOffline ? <OfflineBadge /> : null}
      </span>

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

type DoctorQueueCardProps = {
  onViewAll?: () => void;
};

export default function DoctorQueueCard({ onViewAll }: DoctorQueueCardProps) {
  const router = useRouter();
  const dispatch = useDispatch();
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const todayIso = React.useMemo(() => clinicDateISO(new Date()), []);

  const queueQ = useGetPatientQueueQuery(
    { date: todayIso },
    {
      skip: !canUseApi,
      selectFromResult: (r) => ({
        ...r,
        items: (r.data?.items ?? []) as PatientQueueItem[],
        hasData: Boolean(r.data),
      }),
    },
  );

  const prefetchVisit = React.useCallback(
    (item: PatientQueueItem) => {
      const visitId = item.visitId;
      if (!visitId) return;

      // 1) Prefetch route chunk
      router.prefetch(`/doctor/visits/${visitId}`);

      // 2) Prefetch hot data for that visit
      dispatch(
        api.util.prefetch('getVisitById', visitId, {
          force: false,
        }) as any,
      );

      dispatch(
        api.util.prefetch(
          'getVisitRx',
          { visitId },
          {
            force: false,
          },
        ) as any,
      );

      const patientId = getPatientIdFromQueueItem(item);
      if (patientId) {
        dispatch(
          api.util.prefetch('getPatientById', patientId, {
            force: false,
          }) as any,
        );
      }
    },
    [dispatch, router],
  );

  const openDoctorVisit = (visitId: string) => {
    router.push(`/doctor/visits/${visitId}`);
  };

  const byStatus = React.useMemo(() => {
    const waiting: PatientQueueItem[] = [];
    const inProgress: PatientQueueItem[] = [];
    const done: PatientQueueItem[] = [];

    for (const v of queueQ.items) {
      if (v.status === 'QUEUED') waiting.push(v);
      else if (v.status === 'IN_PROGRESS') inProgress.push(v);
      else done.push(v);
    }

    return { waiting, inProgress, done };
  }, [queueQ.items]);

  const cols: Array<{ status: VisitStatus; data: PatientQueueItem[] }> = [
    { status: 'QUEUED', data: byStatus.waiting },
    { status: 'IN_PROGRESS', data: byStatus.inProgress },
    { status: 'DONE', data: byStatus.done },
  ];

  const showSkeleton = queueQ.isLoading && !queueQ.hasData;

  return (
    <Card className="w-full rounded-2xl border-none bg-white px-4 pb-4 pt-2 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Patient Queue</h2>

        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="rounded-full bg-gray-50 px-3 py-1 text-[11px] font-medium text-gray-800 transition hover:bg-black hover:text-white"
          >
            View all
          </button>
        ) : null}
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {cols.map((c) => {
          const visits = c.data;

          const ordered =
            c.status === 'DONE'
              ? [...visits].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
              : [...visits].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

          const visible = ordered.slice(0, SLOTS_PER_COLUMN);

          return (
            <div key={c.status}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {labelForColumn(c.status)}
              </div>

              <div className="space-y-2">
                {showSkeleton ? (
                  Array.from({ length: SLOTS_PER_COLUMN }).map((_, i) => (
                    <PlaceholderBlock key={i} text="Loading…" />
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
                        onPrefetch={() => prefetchVisit(v)}
                        onClick={() => openDoctorVisit(v.visitId)}
                        isOffline={getIsOffline(v)}
                        dailyPatientNumber={getDailyPatientNumber(v)}
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

      {queueQ.isFetching && queueQ.hasData ? (
        <div className="mt-3 text-[10px] text-gray-400">Syncing…</div>
      ) : null}
    </Card>
  );
}
