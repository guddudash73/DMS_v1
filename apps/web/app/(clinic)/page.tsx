'use client';

import DoctorQueueCard from '@/components/dashboard/DoctorQueueCard';
import VisitorsRatioChart from '@/components/dashboard/VisitorsRatioCharts';
import PatientsPanel from '@/components/dashboard/PatientsPanel';
import QueueSummaryCard from '@/components/dashboard/QueueSummaryCard';

export default function DashboardPage() {
  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="grid h-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(320px,0.9fr)]">
        <div className="flex h-full flex-col gap-6">
          <div className="grid w-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(0,2fr)]">
            <DoctorQueueCard />
            <VisitorsRatioChart />
          </div>
        </div>
        <div className="flex flex-col gap-6 2xl:gap-10">
          <PatientsPanel />
          <QueueSummaryCard />
        </div>
      </div>
    </section>
  );
}
