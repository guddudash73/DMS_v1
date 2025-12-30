'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Card } from '@/components/ui/card';
import DoctorQueuePreferencesDialog from '@/components/dashboard/DoctorQueuePreferencesDialog';

import {
  useGetDoctorsQuery,
  useGetMyPreferencesQuery,
  useGetDoctorQueueQuery,
} from '@/src/store/api';

import type { UserPreferences, Visit, DoctorQueueItem } from '@dms/types';
import { useAuth } from '@/src/hooks/useAuth';
import { clinicDateISO } from '@/src/lib/clinicTime';

const MAX_COLUMNS = 3 as const;

type VisitStatus = Visit['status'];

const statusDotClass: Record<VisitStatus, string> = {
  QUEUED: 'bg-pink-400',
  IN_PROGRESS: 'bg-amber-400',
  DONE: 'bg-emerald-500',
};

function getVisitLabel(v: DoctorQueueItem): string {
  const name = v.patientName?.trim();
  return name && name.length > 0 ? name : `Patient: ${v.patientId}`;
}

function DoctorQueueItemRow({
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
      className="flex h-10 cursor-pointer w-full items-center justify-between rounded-xl bg-white px-3 text-left text-xs text-gray-800 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black/10"
      title="Open visit"
    >
      <span className="truncate font-medium">{label}</span>
      <span
        className={`ml-2 inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass[status]}`}
      />
    </button>
  );
}

type DoctorFromApi = NonNullable<ReturnType<typeof useGetDoctorsQuery>['data']>[number];

type ColumnConfig = {
  headerLabel: string;
  doctor?: DoctorFromApi;
};

const PlaceholderBlock = () => (
  <>
    <div className="flex h-10 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
      No visits done yet.
    </div>
    <div className="flex h-10 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
      No on-going visits.
    </div>
    <div className="flex h-10 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
      No waiting visits.
    </div>
    <div className="flex h-10 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
      No waiting visits.
    </div>
  </>
);

export default function DoctorQueueCard() {
  const router = useRouter();

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

  const selectedIdsFromPrefs =
    (prefs as UserPreferences | undefined)?.dashboard?.selectedDoctorIds ?? [];

  const effectiveSelectedIds = React.useMemo(() => {
    if (selectedIdsFromPrefs.length > 0) return selectedIdsFromPrefs.slice(0, MAX_COLUMNS);
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

  const todayIso = React.useMemo(() => clinicDateISO(new Date()), []);

  const queue1 = useGetDoctorQueueQuery(
    { doctorId: effectiveSelectedIds[0]!, date: todayIso },
    { skip: !canUseApi || !effectiveSelectedIds[0] },
  );

  const queue2 = useGetDoctorQueueQuery(
    { doctorId: effectiveSelectedIds[1]!, date: todayIso },
    { skip: !canUseApi || !effectiveSelectedIds[1] },
  );

  const queue3 = useGetDoctorQueueQuery(
    { doctorId: effectiveSelectedIds[2]!, date: todayIso },
    { skip: !canUseApi || !effectiveSelectedIds[2] },
  );

  const queues = [queue1, queue2, queue3];

  const openClinicVisit = (visitId: string) => {
    router.push(`/visits/${visitId}`);
  };

  return (
    <Card className="w-full rounded-2xl border-none bg-white px-4 pb-4 pt-2 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Doctor&apos;s Queue</h2>
        <DoctorQueuePreferencesDialog />
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {columns.map((col, idx) => {
          const queueHook = queues[idx];
          const isInitialLoading = loadingPrefs || queueHook?.isLoading;

          if (!col.doctor || !canUseApi) {
            return (
              <div key={`col-${idx}`}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {col.headerLabel}
                </div>

                <div className="space-y-2">
                  {isInitialLoading ? (
                    <div className="flex h-10 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
                      Loading…
                    </div>
                  ) : (
                    <PlaceholderBlock />
                  )}
                </div>
              </div>
            );
          }

          const visits: DoctorQueueItem[] = (queueHook?.data?.items ?? []) as DoctorQueueItem[];

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
                  <div className="flex h-10 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
                    Loading…
                  </div>
                ) : (
                  <>
                    {doneVisit ? (
                      <DoctorQueueItemRow
                        label={getVisitLabel(doneVisit)}
                        status={doneVisit.status}
                        onClick={() => openClinicVisit(doneVisit.visitId)}
                      />
                    ) : (
                      <div className="flex h-10 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
                        No visits done yet.
                      </div>
                    )}

                    {inProgressVisit ? (
                      <DoctorQueueItemRow
                        label={getVisitLabel(inProgressVisit)}
                        status={inProgressVisit.status}
                        onClick={() => openClinicVisit(inProgressVisit.visitId)}
                      />
                    ) : (
                      <div className="flex h-10 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
                        No on-going visits.
                      </div>
                    )}

                    {queuedVisits[0] ? (
                      <DoctorQueueItemRow
                        label={getVisitLabel(queuedVisits[0])}
                        status={queuedVisits[0].status}
                        onClick={() => openClinicVisit(queuedVisits[0].visitId)}
                      />
                    ) : (
                      <div className="flex h-10 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
                        No waiting visits.
                      </div>
                    )}

                    {queuedVisits[1] ? (
                      <DoctorQueueItemRow
                        label={getVisitLabel(queuedVisits[1])}
                        status={queuedVisits[1].status}
                        onClick={() => openClinicVisit(queuedVisits[1].visitId)}
                      />
                    ) : (
                      <div className="flex h-10 items-center rounded-xl bg-gray-50 px-3 text-[11px] text-gray-400">
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
