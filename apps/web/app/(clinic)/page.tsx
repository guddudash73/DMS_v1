// apps/web/app/(clinic)/page.tsx
'use client';

import * as React from 'react';

import DoctorQueueCard from '@/components/dashboard/DoctorQueueCard';
import ClinicQueueFullPanel from '@/components/dashboard/ClinicQueueFullPanel';
import VisitorsRatioChart from '@/components/dashboard/VisitorsRatioCharts';
import PatientsPanel from '@/components/dashboard/PatientsPanel';
import QueueSummaryCard from '@/components/dashboard/QueueSummaryCard';
import DailyVisitsBreakdownPanel from '@/components/dashboard/DailyVisitsBreakdownPanel';

import { useGetPatientQueueQuery } from '@/src/store/api';
import type { PatientQueueItem } from '@dcm/types';
import type { PatientsPanelItem } from '@/components/dashboard/PatientsPanel';

import { useAuth } from '@/src/hooks/useAuth';
import { clinicDateISO } from '@/src/lib/clinicTime';

function mapQueueItemToPatientsPanelItem(it: PatientQueueItem): PatientsPanelItem {
  const patientName =
    typeof it.patientName === 'string' && it.patientName.trim().length > 0
      ? it.patientName.trim()
      : `Patient: ${it.patientId}`;

  const billingAmount = typeof it.billingAmount === 'number' ? it.billingAmount : undefined;

  const zeroBilledFromApi = Boolean(it.zeroBilled);
  const zeroBilledFromBilling =
    typeof billingAmount === 'number' && !Number.isNaN(billingAmount) ? billingAmount <= 0 : false;

  return {
    visitId: it.visitId,
    patientName,
    doctorName: 'Clinic',
    tag: it.tag === 'F' ? 'F' : 'N',
    status: it.status,
    billingAmount,
    createdAt: typeof it.createdAt === 'number' ? it.createdAt : 0,
    zeroBilled: zeroBilledFromApi || zeroBilledFromBilling,

    // ✅ IMPORTANT:
    // PatientsPanel shows the patient number pill only if this exists.
    // If your PatientsPanelItem type allows extra keys, this will pass through.
    // If it doesn't, add dailyPatientNumber?: number to PatientsPanelItem type.
    dailyPatientNumber:
      typeof (it as unknown as Record<string, unknown>)['dailyPatientNumber'] === 'number'
        ? ((it as unknown as Record<string, unknown>)['dailyPatientNumber'] as number)
        : undefined,
  };
}

export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [showFullQueue, setShowFullQueue] = React.useState(false);

  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const todayIso = React.useMemo(() => clinicDateISO(new Date()), []);
  const dateForPatients = selectedDate ?? todayIso;

  // ✅ Single “lightweight” fetch for reception-side list UI
  const queueQuery = useGetPatientQueueQuery({ date: dateForPatients }, { skip: !canUseApi });

  const patients: PatientsPanelItem[] = React.useMemo(() => {
    const items = (queueQuery.data?.items ?? []) as PatientQueueItem[];

    const mapped = items
      .map(mapQueueItemToPatientsPanelItem)
      .filter((x) => typeof x.visitId === 'string' && x.visitId.length > 0);

    mapped.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return mapped;
  }, [queueQuery.data]);

  // ✅ Priority: date drilldown view
  if (selectedDate) {
    return (
      <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
        <div className="mx-auto flex h-full w-full max-w-300 flex-col gap-6 2xl:gap-10">
          <VisitorsRatioChart onDateSelect={(dateIso) => setSelectedDate(dateIso)} />
          <DailyVisitsBreakdownPanel date={selectedDate} onBack={() => setSelectedDate(null)} />
        </div>
      </section>
    );
  }

  // ✅ Priority: full queue view (View all)
  if (showFullQueue) {
    return <ClinicQueueFullPanel date={dateForPatients} onBack={() => setShowFullQueue(false)} />;
  }

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="grid h-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.9fr)]">
        <div className="flex h-full flex-col gap-6">
          <div className="grid w-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(0,2fr)]">
            {/* ✅ View all opens the full queue panel */}
            <DoctorQueueCard onViewAll={() => setShowFullQueue(true)} />

            <VisitorsRatioChart onDateSelect={(dateIso) => setSelectedDate(dateIso)} />
          </div>
        </div>

        <div className="flex flex-col gap-6 2xl:gap-10">
          <PatientsPanel
            title="Patients."
            dateLabel={todayIso === dateForPatients ? 'Today' : dateForPatients}
            dateIso={dateForPatients}
            patients={patients}
            loading={queueQuery.isLoading || queueQuery.isFetching}
            canUseApi={canUseApi}
          />

          {/* ✅ keep summary aligned to the same date */}
          <QueueSummaryCard date={dateForPatients} />
        </div>
      </div>
    </section>
  );
}
