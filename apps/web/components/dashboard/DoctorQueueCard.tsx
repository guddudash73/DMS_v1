// apps/web/components/dashboard/DoctorQueueCard.tsx
'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import DoctorQueuePreferencesDialog from '@/components/dashboard/DoctorQueuePreferencesDialog';
import {
  useGetDoctorsQuery,
  useGetMyPreferencesQuery,
  useGetDoctorQueueQuery,
} from '@/src/store/api';
import type { UserPreferences, AdminDoctorListItem, Visit } from '@dms/types';
import { useAuth } from '@/src/hooks/useAuth';

const MAX_COLUMNS = 3 as const;

type VisitStatus = Visit['status'];

const statusDotClass: Record<VisitStatus, string> = {
  QUEUED: 'bg-pink-400',
  IN_PROGRESS: 'bg-amber-400',
  DONE: 'bg-emerald-500',
};

function DoctorQueueItem({ label, status }: { label: string; status: VisitStatus }) {
  return (
    <div className="flex h-8 items-center justify-between rounded-xl bg-white px-3 text-xs text-gray-800 shadow-[0_0_0_1px_rgba(0,0,0,0.04)]">
      <span className="truncate">{label}</span>
      <span
        className={`ml-2 inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass[status]}`}
      />
    </div>
  );
}

type ColumnConfig = {
  headerLabel: string;
  doctor?: AdminDoctorListItem;
};

const getVisitLabel = (visit: Visit): string => visit.reason || `Patient: ${visit.patientId}`;

const PlaceholderBlock = () => (
  <>
    {/* DONE placeholder */}
    <div className="flex h-8 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
      No visits done yet.
    </div>
    {/* IN_PROGRESS placeholder */}
    <div className="flex h-8 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
      No on-going visits.
    </div>
    {/* QUEUED #1 placeholder */}
    <div className="flex h-8 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
      No waiting visits.
    </div>
    {/* QUEUED #2 placeholder */}
    <div className="flex h-8 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
      No waiting visits.
    </div>
  </>
);

export default function DoctorQueueCard() {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const { data: doctors, isLoading: doctorsLoading } = useGetDoctorsQuery(undefined, {
    skip: !canUseApi,
  });

  const {
    data: prefs,
    isLoading: prefsLoading,
    isFetching: prefsFetching,
  } = useGetMyPreferencesQuery(undefined, {
    skip: !canUseApi,
  });

  const loadingPrefs = doctorsLoading || prefsLoading || prefsFetching;

  // Preferences shape: { dashboard?: { selectedDoctorIds: string[] } }
  const selectedIdsFromPrefs =
    (prefs as UserPreferences | undefined)?.dashboard?.selectedDoctorIds ?? [];

  const effectiveSelectedIds = React.useMemo(() => {
    if (selectedIdsFromPrefs.length > 0) {
      return selectedIdsFromPrefs.slice(0, MAX_COLUMNS);
    }
    return [] as string[];
  }, [selectedIdsFromPrefs]);

  const columns: ColumnConfig[] = React.useMemo(() => {
    return Array.from({ length: MAX_COLUMNS }).map((_, index) => {
      const doctorId = effectiveSelectedIds[index];
      const doctor = doctors?.find((d) => d.doctorId === doctorId);

      const headerLabel = doctor
        ? doctor.fullName || doctor.displayName || `Doctor ${index + 1}`
        : `Doctor ${index + 1} - Not Available`;

      return { headerLabel, doctor };
    });
  }, [effectiveSelectedIds, doctors]);

  // Today in YYYY-MM-DD
  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Queue hooks (one per potential doctor column)
  const queue1 = useGetDoctorQueueQuery(
    { doctorId: effectiveSelectedIds[0]!, date: todayIso },
    {
      skip: !canUseApi || !effectiveSelectedIds[0],
    },
  );

  const queue2 = useGetDoctorQueueQuery(
    { doctorId: effectiveSelectedIds[1]!, date: todayIso },
    {
      skip: !canUseApi || !effectiveSelectedIds[1],
    },
  );

  const queue3 = useGetDoctorQueueQuery(
    { doctorId: effectiveSelectedIds[2]!, date: todayIso },
    {
      skip: !canUseApi || !effectiveSelectedIds[2],
    },
  );

  const queues = [queue1, queue2, queue3];

  return (
    <Card className="w-full rounded-2xl border border-none bg-white px-4 pb-4 pt-2 shadow-sm gap-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Doctor&apos;s Queue</h2>
        <DoctorQueuePreferencesDialog />
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {columns.map((col, idx) => {
          const queueHook = queues[idx];
          const isInitialLoading = loadingPrefs || queueHook?.isLoading;

          // If no doctor selected for this column, we *always* show the placeholders
          if (!col.doctor || !canUseApi) {
            return (
              <div key={`col-${idx}`}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {col.headerLabel}
                </div>
                <div className="space-y-2">
                  {isInitialLoading ? (
                    <div className="flex h-8 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
                      Loading…
                    </div>
                  ) : (
                    <PlaceholderBlock />
                  )}
                </div>
              </div>
            );
          }

          const visits: Visit[] = queueHook?.data?.items ?? [];

          // Most recent DONE (list is oldest→newest so reverse to get latest DONE)
          const doneVisit = [...visits].reverse().find((v) => v.status === 'DONE');
          const inProgressVisit = visits.find((v) => v.status === 'IN_PROGRESS');
          const queuedVisits = visits.filter((v) => v.status === 'QUEUED').slice(0, 2);

          return (
            <div key={col.doctor.doctorId}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {col.headerLabel}
              </div>

              <div className="space-y-2">
                {isInitialLoading ? (
                  <div className="flex h-8 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
                    Loading…
                  </div>
                ) : (
                  <>
                    {/* 1) Recently DONE */}
                    {doneVisit ? (
                      <DoctorQueueItem label={getVisitLabel(doneVisit)} status={doneVisit.status} />
                    ) : (
                      <div className="flex h-8 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
                        No visits done yet.
                      </div>
                    )}

                    {/* 2) IN_PROGRESS */}
                    {inProgressVisit ? (
                      <DoctorQueueItem
                        label={getVisitLabel(inProgressVisit)}
                        status={inProgressVisit.status}
                      />
                    ) : (
                      <div className="flex h-8 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
                        No on-going visits.
                      </div>
                    )}

                    {/* 3) Waiting visit #1 */}
                    {queuedVisits[0] ? (
                      <DoctorQueueItem
                        label={getVisitLabel(queuedVisits[0])}
                        status={queuedVisits[0].status}
                      />
                    ) : (
                      <div className="flex h-8 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
                        No waiting visits.
                      </div>
                    )}

                    {/* 4) Waiting visit #2 */}
                    {queuedVisits[1] ? (
                      <DoctorQueueItem
                        label={getVisitLabel(queuedVisits[1])}
                        status={queuedVisits[1].status}
                      />
                    ) : (
                      <div className="flex h-8 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
                        No waiting visits.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
