'use client';

import * as React from 'react';

import DoctorQueueCard from '@/components/doctor/dashboard/DoctorQueueCard';
import QueueSummaryCard from '@/components/doctor/dashboard/QueueSummaryCard';
import DoctorPatientsChart from '@/components/doctor/dashboard/DoctorPatientsChart';
import DoctorDailyVisitsBreakdownPanel from '@/components/doctor/dashboard/DoctorDailyVisitsBreakdownPanel';
import TodayCaseMixCard from '@/components/doctor/dashboard/TodayCaseMixCard';
import RecentlyCompletedCard from '@/components/doctor/dashboard/RecentlyCompletedCard';
import DoctorQueueFullPanel from '@/components/doctor/dashboard/DoctorQueueFullPanel';

type ViewMode = 'dashboard' | 'chart' | 'queue';

export default function DoctorDashboardPage() {
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<ViewMode>('dashboard');

  React.useEffect(() => {
    if (selectedDate) setViewMode('chart');
    else if (viewMode === 'chart') setViewMode('dashboard');
  }, [selectedDate]);

  if (viewMode === 'queue') {
    return <DoctorQueueFullPanel onBack={() => setViewMode('dashboard')} />;
  }

  if (viewMode === 'chart' && selectedDate) {
    return (
      <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
        <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col gap-6 2xl:gap-10">
          <DoctorPatientsChart onDateSelect={(dateIso) => setSelectedDate(dateIso)} />

          <DoctorDailyVisitsBreakdownPanel
            date={selectedDate}
            onBack={() => setSelectedDate(null)}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="grid h-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-6 2xl:gap-10">
          <DoctorQueueCard onViewAll={() => setViewMode('queue')} />
          <QueueSummaryCard />
        </div>

        <div className="flex h-full flex-col gap-6 2xl:gap-10">
          <DoctorPatientsChart onDateSelect={(dateIso) => setSelectedDate(dateIso)} />

          <div className="grid grid-cols-1 gap-6 items-stretch lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
            <TodayCaseMixCard />
            <RecentlyCompletedCard />
          </div>
        </div>
      </div>
    </section>
  );
}
