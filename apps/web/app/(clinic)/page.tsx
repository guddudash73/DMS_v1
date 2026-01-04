'use client';

import * as React from 'react';

import DoctorQueueCard from '@/components/dashboard/DoctorQueueCard';
import VisitorsRatioChart from '@/components/dashboard/VisitorsRatioCharts';
import PatientsPanel from '@/components/dashboard/PatientsPanel';
import QueueSummaryCard from '@/components/dashboard/QueueSummaryCard';
import DailyVisitsBreakdownPanel from '@/components/dashboard/DailyVisitsBreakdownPanel';

import { useGetDailyVisitsBreakdownQuery } from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';
import { clinicDateISO } from '@/src/lib/clinicTime';

type LegacyBreakdownDoctorItem = {
  doctorId: string;
  doctorName: string;
  total: number;
  items: {
    visitId: string;
    patientName: string;
    doctorName?: string;
    tag?: 'N' | 'F' | 'Z';
    status: 'QUEUED' | 'IN_PROGRESS' | 'DONE';
    billingAmount?: number;
    createdAt: number;
  }[];
};

type LegacyBreakdownResponse = {
  date: string;
  doctors: LegacyBreakdownDoctorItem[];
  totalVisits: number;
};

type ClinicWideBreakdownItem = {
  visitId: string;
  patientName: string;
  tag?: 'N' | 'F' | 'Z';
  status: 'QUEUED' | 'IN_PROGRESS' | 'DONE';
  billingAmount?: number;
  createdAt: number;
};

type ClinicWideBreakdownResponse = {
  date: string;
  items: ClinicWideBreakdownItem[];
  totalVisits: number;
};

export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const todayIso = React.useMemo(() => clinicDateISO(new Date()), []);
  const dateForPatients = selectedDate ?? todayIso;

  const breakdownQuery = useGetDailyVisitsBreakdownQuery(dateForPatients, {
    skip: !canUseApi,
  });

  const patients = React.useMemo(() => {
    const data = breakdownQuery.data as unknown;

    // ✅ Supports BOTH:
    // - old grouped-by-doctor payload: { doctors: [...] }
    // - new clinic-wide payload: { items: [...] }
    const items: ClinicWideBreakdownItem[] = (() => {
      if (data && typeof data === 'object' && 'items' in (data as any)) {
        return ((data as ClinicWideBreakdownResponse).items ?? []).slice();
      }

      const doctors = (data as LegacyBreakdownResponse | undefined)?.doctors ?? [];
      return doctors.flatMap((d) =>
        (d.items ?? []).map((it) => ({
          visitId: it.visitId,
          patientName: it.patientName,
          tag: it.tag,
          status: it.status,
          billingAmount: it.billingAmount,
          createdAt: it.createdAt,
        })),
      );
    })();

    const flat = items.map((it) => ({
      visitId: it.visitId,
      patientName: it.patientName,
      // ✅ clinic-wide now; keep PatientsPanel prop stable
      doctorName: 'Clinic',
      tag: (it.tag ?? 'O') as 'N' | 'F' | 'Z' | 'O',
      status: it.status,
      billingAmount: it.billingAmount,
      createdAt: it.createdAt,
    }));

    flat.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return flat;
  }, [breakdownQuery.data, breakdownQuery.isLoading, breakdownQuery.isFetching]);

  if (selectedDate) {
    return (
      <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
        <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col gap-6 2xl:gap-10">
          <VisitorsRatioChart onDateSelect={(dateIso) => setSelectedDate(dateIso)} />
          <DailyVisitsBreakdownPanel date={selectedDate} onBack={() => setSelectedDate(null)} />
        </div>
      </section>
    );
  }

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="grid h-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.9fr)]">
        <div className="flex h-full flex-col gap-6">
          <div className="grid w-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(0,2fr)]">
            {/* ✅ This card should already be updated to clinic-wide internally */}
            <DoctorQueueCard />
            <VisitorsRatioChart onDateSelect={(dateIso) => setSelectedDate(dateIso)} />
          </div>
        </div>

        <div className="flex flex-col gap-6 2xl:gap-10">
          <PatientsPanel
            title="Patients."
            dateLabel={todayIso === dateForPatients ? 'Today' : dateForPatients}
            dateIso={dateForPatients}
            patients={patients}
            loading={breakdownQuery.isLoading || breakdownQuery.isFetching}
            canUseApi={canUseApi}
          />
          {/* ✅ Summary should also be clinic-wide internally */}
          <QueueSummaryCard />
        </div>
      </div>
    </section>
  );
}
