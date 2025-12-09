'use client';

import { useRequireAuth } from '@/src/hooks/useAuth';
import ClinicShell from '@/components/layout/ClinicShell';
import DoctorQueueCard from '@/components/dashboard/DoctorQueueCard';
import VisitorsRatioChart from '@/components/dashboard/VisitorsRatioCharts';
import PatientsPanel from '@/components/dashboard/PatientsPanel';
import QueueSummaryCard from '@/components/dashboard/QueueSummaryCard';

export default function DashboardPage() {
  // Still enforces auth on the client for now
  useRequireAuth();

  return (
    <section className="h-full">
      <ClinicShell title="Dashboard">
        <div className="grid h-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(320px,0.9fr)]">
          <div className="flex h-full flex-col gap-6">
            {/* Row 1: Doctor's Queue (left) – other cards will come later */}
            <div className="grid w-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(0,2fr)]">
              <DoctorQueueCard />
              <VisitorsRatioChart />
              {/* Later: right-hand Patients list card will sit next to this */}
            </div>
            {/* TODO: next rows (ratio chart, monthly stats, queue summary) */}
          </div>
          <div className="flex flex-col gap-6">
            <PatientsPanel />
            <QueueSummaryCard />
          </div>
        </div>
      </ClinicShell>
    </section>
  );
}
